import { Readable } from "node:stream"
import type { EntityManager } from "@mikro-orm/sql"
import yazl from "yazl"
import type { Config } from "../../core/config.ts"
import {
  CookNote,
  Household,
  HouseholdMember,
  Recipe,
  RecipePairing,
  RecipeVersion,
  Tag,
} from "../../database/entities/index.ts"
import { ACROSS_HOUSEHOLDS } from "../../database/scope.ts"
import { readPhoto } from "../recipes/photos.ts"
import { toNumber } from "../recipes/recipes.ts"
import { tagsOf } from "../recipes/tags.ts"
import type { Settings } from "../settings/settings.ts"
import type { FileStore } from "../storage/files.ts"
import {
  EXPORT_FILES,
  EXPORT_FORMAT,
  EXPORT_VERSION,
  photoPath,
  type HouseholdFile,
  type Manifest,
  type RecipeFile,
} from "./format.ts"

const json = (value: unknown) => Buffer.from(JSON.stringify(value, null, 2))

/** Everyone who's been in the household, by user id, as their email. */
async function emailsOf(em: EntityManager, householdId: string) {
  const members = await em.find(
    HouseholdMember,
    { household: householdId },
    { ...ACROSS_HOUSEHOLDS, populate: ["user"] }
  )
  return new Map(
    members.map((member) => [member.user.id, member.user.getEntity().email])
  )
}

/** The household's recipes, as the export holds them. */
async function recipesOf(
  em: EntityManager,
  emails: Map<string, string>
): Promise<RecipeFile[]> {
  const recipes = await em.find(
    Recipe,
    {},
    { populate: ["ingredients", "steps"], orderBy: { createdAt: "asc" } }
  )
  const ids = recipes.map((recipe) => recipe.id)
  const tags = await tagsOf(em, ids)
  const versions = await em.find(
    RecipeVersion,
    { recipe: { $in: ids } },
    { orderBy: { createdAt: "asc" } }
  )
  const notes = await em.find(
    CookNote,
    { recipe: { $in: ids } },
    { orderBy: { createdAt: "asc" } }
  )
  const pairings = await em.find(
    RecipePairing,
    { recipe: { $in: ids } },
    { orderBy: { createdAt: "asc" } }
  )
  const tagNames = new Map(
    (await em.find(Tag, {})).map((tag) => [tag.nameKey, tag.name])
  )
  const emailOf = (user: { id: string } | null | undefined) =>
    (user && emails.get(user.id)) ?? null
  const byRecipe = <T extends { recipe: { id: string } }>(rows: T[]) => {
    const map = new Map<string, T[]>()
    for (const row of rows) {
      map.set(row.recipe.id, [...(map.get(row.recipe.id) ?? []), row])
    }
    return map
  }
  const versionsOf = byRecipe(versions)
  const notesOf = byRecipe(notes)
  const pairingsOf = byRecipe(pairings)

  return recipes.map((recipe) => ({
    id: recipe.id,
    slug: recipe.slug,
    name: recipe.name,
    description: recipe.description ?? null,
    servings: toNumber(recipe.servings),
    yieldText: recipe.yieldText ?? null,
    prepMinutes: recipe.prepMinutes ?? null,
    cookMinutes: recipe.cookMinutes ?? null,
    totalMinutes: recipe.totalMinutes ?? null,
    notes: recipe.notes ?? null,
    sourceUrl: recipe.sourceUrl ?? null,
    rating: recipe.rating ?? null,
    nutrition: (recipe.nutrition as Record<string, unknown> | null) ?? null,
    dietOverrides: recipe.dietOverrides ?? {},
    needs: recipe.needs ?? [],
    origin: recipe.origin,
    importedFrom: recipe.importedFrom ?? null,
    lastMadeAt: recipe.lastMadeAt?.toISOString() ?? null,
    createdAt: recipe.createdAt.toISOString(),
    updatedAt: recipe.updatedAt.toISOString(),
    createdBy: emailOf(recipe.createdBy),
    tags: tags.get(recipe.id) ?? [],
    ingredients: recipe.ingredients.getItems().map((line) => ({
      section: line.section ?? null,
      text: line.rawText,
      mark: line.mark ?? null,
    })),
    steps: recipe.steps.getItems().map((step) => ({
      section: step.section ?? null,
      text: step.text,
    })),
    photo: recipe.image ? photoPath(recipe.id) : null,
    versions: (versionsOf.get(recipe.id) ?? []).map((version) => ({
      source: version.source,
      snapshot: version.snapshot,
      createdAt: version.createdAt.toISOString(),
      createdBy: emailOf(version.createdBy),
    })),
    cookNotes: (notesOf.get(recipe.id) ?? []).map((note) => ({
      rating: note.rating ?? null,
      note: note.note ?? null,
      createdAt: note.createdAt.toISOString(),
      by: emailOf(note.user),
    })),
    pairings: (pairingsOf.get(recipe.id) ?? []).flatMap(
      (pairing): RecipeFile["pairings"] =>
        pairing.pairedRecipe
          ? [{ recipe: pairing.pairedRecipe.id }]
          : pairing.tagKey
            ? [{ tag: tagNames.get(pairing.tagKey) ?? pairing.tagKey }]
            : []
    ),
  }))
}

/**
 * A household's export: a zip of its details and recipes, with their
 * photos, streamed as it's made. Recipes in Recently deleted stay behind.
 */
export async function exportHousehold(
  em: EntityManager,
  deps: { config: Config; settings: Settings; files: FileStore },
  householdId: string
) {
  const household = await em.findOneOrFail(Household, { id: householdId })
  const emails = await emailsOf(em, householdId)
  const recipes = await recipesOf(em, emails)
  const settings = Object.fromEntries(
    (await deps.settings.describeHousehold(em, householdId))
      .filter((state) => state.source === "saved" && !state.secret)
      .map((state) => [state.key, state.value])
  )
  const householdFile: HouseholdFile = {
    name: household.name,
    timeZone: household.timeZone,
    country: household.country ?? null,
    currency: household.currency ?? null,
    weekStartsOn: household.weekStartsOn,
    planning: (household.settings as Record<string, unknown> | null) ?? null,
    settings,
  }
  const withPhotos = await em.find(
    Recipe,
    { image: { $ne: null } },
    { fields: ["id", "image"] }
  )
  const manifest: Manifest = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    merranVersion: deps.config.version,
    household: { name: household.name },
    counts: { recipes: recipes.length, photos: withPhotos.length },
  }

  const zip = new yazl.ZipFile()
  zip.addBuffer(json(manifest), EXPORT_FILES.manifest)
  zip.addBuffer(json(householdFile), EXPORT_FILES.household)
  zip.addBuffer(json(recipes), EXPORT_FILES.recipes)
  // Photos are read one at a time, as the zip reaches them. They're
  // already compressed, so they're stored as they are.
  for (const recipe of withPhotos) {
    zip.addReadStreamLazy(photoPath(recipe.id), { compress: false }, (done) => {
      readPhoto(deps.files, householdId, recipe.image!, "full").then(
        (photo) => done(null, Readable.from(photo ? [photo] : [])),
        (err: unknown) => done(err, Readable.from([]))
      )
    })
  }
  zip.end()

  const day = new Date().toISOString().slice(0, 10)
  return {
    filename: `merran-${household.slug}-${day}.zip`,
    stream: Readable.toWeb(
      zip.outputStream as Readable
    ) as ReadableStream<Uint8Array>,
  }
}

import { rm } from "node:fs/promises"
import type { EntityManager } from "@mikro-orm/sql"
import { joinSections } from "@merran/shared"
import { z } from "zod"
import {
  Household,
  Recipe,
  RecipePairing,
  RECIPE_ORIGINS,
  type Nutrition,
} from "../../database/entities/index.ts"
import { HOUSEHOLD_FILTER, NOT_DELETED_FILTER } from "../../database/scope.ts"
import { RecipeInputSchema } from "../../http/schemas/recipes.ts"
import { membersByEmail } from "../households.ts"
import { enqueue } from "../jobs/jobs.ts"
import { JobStopped, type JobDeps, type JobHandler } from "../jobs/runner.ts"
import { storePhoto } from "../recipes/photos.ts"
import { importRecipe, type RecipeOrigin } from "../recipes/recipes.ts"
import { scheduleAutoplan } from "../plan/autoplan.ts"
import { tagKey } from "../recipes/tags.ts"
import type { HouseholdFile, RecipeFile } from "./format.ts"
import { openExport } from "./read-export.ts"

const KIND = "household.import"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const Payload = z.object({
  /** The upload, on disk. */
  file: z.string(),
  /** A household made for this export, which takes its details too. */
  newHousehold: z.boolean(),
  userId: z.string().nullable(),
})

/** Starts importing an upload into a household, in the background. */
export function startImport(
  em: EntityManager,
  options: {
    householdId: string
    file: string
    newHousehold: boolean
    userId: string
  }
) {
  return enqueue(em, {
    kind: KIND,
    householdId: options.householdId,
    payload: {
      file: options.file,
      newHousehold: options.newHousehold,
      userId: options.userId,
    },
    createdBy: options.userId,
    // Imports are never tried again by themselves; Try again starts over,
    // skipping recipes already in.
    maxAttempts: 1,
  })
}

/** A recipe's content, checked as if typed into the editor. */
function inputOf(recipe: RecipeFile) {
  return RecipeInputSchema.parse({
    name: recipe.name,
    description: recipe.description,
    servings: recipe.servings,
    yieldText: recipe.yieldText,
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    totalMinutes: recipe.totalMinutes,
    notes: recipe.notes,
    sourceUrl: recipe.sourceUrl,
    rating: recipe.rating,
    tags: recipe.tags.slice(0, 30),
    ingredients: joinSections(recipe.ingredients),
    steps: joinSections(recipe.steps),
  })
}

/** A new household takes the export's details and settings too. */
async function takeDetails(
  em: EntityManager,
  deps: JobDeps,
  householdId: string,
  details: HouseholdFile,
  userId: string | null
) {
  const household = await em.findOneOrFail(Household, { id: householdId })
  household.timeZone = details.timeZone
  household.country = details.country
  household.currency = details.currency
  household.weekStartsOn = details.weekStartsOn
  household.settings = details.planning
  await em.flush()
  // An autoplan that was on runs here too.
  await scheduleAutoplan(em, householdId)
  // Only settings this Merran knows; each on its own, so one it won't take
  // doesn't stop the rest.
  const known = new Set(
    deps.settings.definitions("household").map((setting) => setting.key)
  )
  for (const [key, value] of Object.entries(details.settings)) {
    if (!known.has(key)) continue
    await deps.settings
      .saveHousehold(em, householdId, { [key]: value }, userId)
      .catch(() => {})
  }
}

/**
 * The import job: every recipe in the export, one at a time, so what's in
 * stays in if it stops. Recipes already here (the same export imported
 * twice) are skipped.
 */
export const importJob: JobHandler = {
  kind: KIND,
  concurrency: 2,
  async run({ em, householdId, payload, progress, signal, deps }) {
    if (!householdId) throw new Error("An import needs a household.")
    const { file, newHousehold, userId } = Payload.parse(payload)
    const data = await openExport(file)
    try {
      if (newHousehold) {
        await takeDetails(em, deps, householdId, await data.household(), userId)
      }
      const recipes = await data.recipes()

      // People are matched by email to who's in this household.
      const userOf = await membersByEmail(em, householdId)

      /** Each recipe's id in the export, and its id here. */
      const ids = new Map<string, string>()
      const added = new Set<string>()
      let photos = 0
      for (const [index, recipe] of recipes.entries()) {
        if (signal.aborted) throw new JobStopped()
        const here = UUID.test(recipe.id)
          ? await em.findOne(
              Recipe,
              { id: recipe.id },
              { filters: { [NOT_DELETED_FILTER]: false } }
            )
          : null
        if (here) {
          ids.set(recipe.id, here.id)
          await progress(index + 1, recipes.length)
          continue
        }
        // Another household on this server has it, so it gets a new id.
        const taken =
          UUID.test(recipe.id) &&
          (await em.count(
            Recipe,
            { id: recipe.id },
            {
              filters: {
                [HOUSEHOLD_FILTER]: false,
                [NOT_DELETED_FILTER]: false,
              },
            }
          )) > 0

        let photoId: string | null = null
        const photo = recipe.photo ? await data.read(recipe.photo) : null
        if (photo) {
          photoId = await storePhoto(deps.files, householdId, photo).catch(
            () => null
          )
          if (photoId) photos++
        }

        const id = await importRecipe(em, {
          householdId,
          id: UUID.test(recipe.id) && !taken ? recipe.id : null,
          slug: recipe.slug,
          input: inputOf(recipe),
          origin: (RECIPE_ORIGINS as readonly string[]).includes(recipe.origin)
            ? (recipe.origin as RecipeOrigin)
            : "merran",
          importedFrom: recipe.importedFrom ?? null,
          photoId,
          createdBy: userOf(recipe.createdBy),
          lastMadeAt: recipe.lastMadeAt ? new Date(recipe.lastMadeAt) : null,
          nutrition: recipe.nutrition as Nutrition | null,
          dietOverrides: recipe.dietOverrides,
          needs: recipe.needs,
          marks: recipe.ingredients.map((line) => ({
            line: line.text,
            mark: line.mark ?? null,
          })),
          createdAt: new Date(recipe.createdAt),
          updatedAt: new Date(recipe.updatedAt),
          versions: recipe.versions.map((version) => ({
            source: version.source,
            snapshot: version.snapshot,
            createdAt: new Date(version.createdAt),
            createdBy: userOf(version.createdBy),
          })),
          cookNotes: recipe.cookNotes.map((note) => ({
            rating: note.rating,
            note: note.note,
            createdAt: new Date(note.createdAt),
            user: userOf(note.by),
          })),
        })
        ids.set(recipe.id, id)
        added.add(id)
        await progress(index + 1, recipes.length)
      }

      // What goes with what, once every recipe is in: only for those just
      // added, so a second import doesn't double them.
      for (const recipe of recipes) {
        const id = ids.get(recipe.id)
        if (!id || !added.has(id)) continue
        for (const pairing of recipe.pairings) {
          if ("recipe" in pairing) {
            const paired = ids.get(pairing.recipe)
            if (paired && paired !== id) {
              em.create(RecipePairing, {
                household: householdId,
                recipe: id,
                pairedRecipe: paired,
              })
            }
          } else if (tagKey(pairing.tag)) {
            em.create(RecipePairing, {
              household: householdId,
              recipe: id,
              tagKey: tagKey(pairing.tag),
            })
          }
        }
      }
      await em.flush()

      const result = {
        recipes: added.size,
        photos,
        skipped: recipes.length - added.size,
      }
      // Done with: an upload that failed stays for Try again, a week at most.
      data.close()
      await rm(file, { force: true })
      return result
    } finally {
      data.close()
    }
  },
}

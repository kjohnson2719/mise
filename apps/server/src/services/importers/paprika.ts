import { gunzipSync } from "node:zlib"
import { joinSections, splitSections } from "@merran/shared"
import sharp from "sharp"
import type { Fetcher } from "../fetch/public-fetch.ts"
import { MAX_PHOTO_BYTES } from "../recipes/photos.ts"
import { cleanText, parseYield } from "../recipes/import/recipe-data.ts"
import type { OpenZip } from "../transfer/zip.ts"
import { asLink, plainText, readMinutes, stars, tagList } from "./text.ts"
import type { AppRecipeBody, AppSource } from "./types.ts"

// Paprika's export (.paprikarecipes): a zip of .paprikarecipe files, each
// one recipe as gzipped JSON, its photo inside. One recipe exported on its
// own is just the gzipped JSON. Paprika has no sections, so lines like "For
// the sauce:" are taken as headings.

/* eslint-disable @typescript-eslint/no-explicit-any -- Paprika's JSON, as it comes */

type PaprikaRecipe = Record<string, any>

/** A photo this big on its short side is good enough without looking further. */
const GOOD_PHOTO_SIDE = 450

/** One recipe, from its gzipped JSON, or null if that isn't what it is. */
export function readPaprikaRecipe(file: Buffer | null): PaprikaRecipe | null {
  if (!file || file[0] !== 0x1f || file[1] !== 0x8b) return null
  try {
    const recipe = JSON.parse(
      gunzipSync(file, { maxOutputLength: 100_000_000 }).toString("utf8")
    )
    return recipe && typeof recipe.name === "string" ? recipe : null
  } catch {
    return null
  }
}

/** What the recipe is in Paprika: its id, or failing that its name. */
function paprikaRef(recipe: PaprikaRecipe) {
  const id = cleanText(recipe.uid) || cleanText(recipe.hash)
  return id
    ? `paprika:${id.toLowerCase()}`
    : `paprika:name:${cleanText(recipe.name).toLowerCase()}`
}

/** Lines as the editor takes them, "Heading:" lines as headings. */
function editorLines(items: string[], max: number, count: number) {
  return joinSections(
    splitSections(items, { colonHeadings: true }).map((item) => ({
      section: item.section?.replace(/^#+\s*/, "").slice(0, 200) ?? null,
      text: item.text.replace(/^#+\s*/, "").slice(0, max),
    }))
  ).slice(0, count)
}

/**
 * Directions: a step per paragraph, or per line when there are no
 * paragraphs, with "1." and the like taken off.
 */
function stepsOf(text: unknown) {
  const all = plainText(text)
  if (!all) return []
  const paragraphs = all.split(/\n{2,}/)
  return (paragraphs.length > 1 ? paragraphs : all.split("\n"))
    .map((step) =>
      step
        .replace(/\s*\n\s*/g, " ")
        .replace(/^(?:step\s*)?\d+\s*[.):-]\s*/i, "")
        .trim()
    )
    .filter(Boolean)
}

/** When it was added: "2023-06-01 09:30:00", in no zone, taken as UTC. */
function createdOf(value: unknown) {
  const match = cleanText(value).match(
    /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?))?/
  )
  if (!match) return null
  const date = new Date(`${match[1]}T${match[2] ?? "00:00:00"}Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

async function shortSide(photo: Buffer) {
  try {
    const { width = 0, height = 0 } = await sharp(photo).metadata()
    return Math.min(width, height)
  } catch {
    return 0
  }
}

/**
 * The best photo: the recipe's own when it's big enough, otherwise the
 * original from its link (Paprika's own copy can be a small square), and
 * failing that the small one. Then any others it has.
 */
async function photoOf(recipe: PaprikaRecipe, fetcher: Fetcher | null) {
  const inside = [
    recipe.photo_large,
    recipe.photo_data,
    ...(Array.isArray(recipe.photos)
      ? recipe.photos.map((photo: any) => photo?.data)
      : []),
  ]
    .filter((data): data is string => typeof data === "string" && data !== "")
    .map((data) => Buffer.from(data, "base64"))

  let best: { photo: Buffer; side: number } | null = null
  for (const photo of inside) {
    const side = await shortSide(photo)
    if (side >= GOOD_PHOTO_SIDE) return photo
    if (side > (best?.side ?? 0)) best = { photo, side }
  }
  const link = asLink(recipe.image_url)
  if (link && fetcher) {
    try {
      const { body } = await fetcher(link, {
        accept: "image/avif,image/webp,image/*",
        maxBytes: MAX_PHOTO_BYTES,
      })
      if ((await shortSide(body)) > (best?.side ?? 0)) return body
    } catch {
      // The site's gone or won't say; Paprika's own copy will do.
    }
  }
  return best?.photo ?? null
}

/** A Paprika recipe as Merran takes it. */
export function fromPaprika(
  recipe: PaprikaRecipe,
  fetcher: Fetcher | null
): AppRecipeBody {
  const link = asLink(recipe.source_url) ?? asLink(recipe.source)
  const source = cleanText(recipe.source)
  const nutrition = plainText(recipe.nutritional_info)
  const difficulty = cleanText(recipe.difficulty)
  // What Paprika keeps that Merran has no place for goes in the notes.
  const notes = [
    plainText(recipe.notes),
    nutrition && `Nutrition:\n${nutrition}`,
    difficulty && `Difficulty: ${difficulty}`,
    !link && source && `From ${source}`,
  ]
    .filter(Boolean)
    .join("\n\n")
  const description = plainText(recipe.description)
  const createdAt = createdOf(recipe.created)

  return {
    input: {
      name: (cleanText(recipe.name) || "Untitled recipe").slice(0, 200),
      description: description ? description.slice(0, 2000) : null,
      ...parseYield(cleanText(recipe.servings)),
      prepMinutes: readMinutes(recipe.prep_time),
      cookMinutes: readMinutes(recipe.cook_time),
      totalMinutes: readMinutes(recipe.total_time),
      notes: notes ? notes.slice(0, 5000) : null,
      sourceUrl: link,
      rating: stars(recipe.rating),
      tags: tagList(Array.isArray(recipe.categories) ? recipe.categories : []),
      ingredients: editorLines(
        plainText(recipe.ingredients).split("\n"),
        500,
        300
      ),
      steps: editorLines(stepsOf(recipe.directions), 5000, 200),
    },
    nutrition: null,
    lastMadeAt: null,
    createdAt,
    updatedAt: createdAt,
    createdBy: null,
    cookNotes: [],
    photo: () => photoOf(recipe, fetcher),
  }
}

/** A recipe found in a file: what it is, and how to read it again. */
type Found = {
  ref: string
  name: string
  recipe: () => Promise<PaprikaRecipe | null>
}

/** Recipes, as they're found and as the import reads them. */
function sourceOf(found: Found[], close: () => void) {
  return {
    refs: found.map((item) => item.ref),
    source(fetcher: Fetcher | null): AppSource {
      return {
        app: "paprika",
        total: found.length,
        async *recipes() {
          for (const item of found) {
            yield {
              ref: item.ref,
              name: item.name,
              read: async () => {
                const recipe = await item.recipe()
                if (!recipe) throw new Error("It can't be read any more.")
                return fromPaprika(recipe, fetcher)
              },
            }
          }
        },
        close,
      }
    },
  }
}

/** A .paprikarecipes export, or null if the zip isn't one. */
export async function readPaprikaExport(zip: OpenZip) {
  const files = zip.files().filter((file) => {
    const name = file.name.split("/").pop()!
    return (
      name.toLowerCase().endsWith(".paprikarecipe") &&
      !name.startsWith(".") &&
      !file.name.startsWith("__MACOSX/")
    )
  })
  if (files.length === 0) return null
  // Each is read now for what it is, and again as it's imported, so they
  // aren't all held at once, photos and all.
  const found: Found[] = []
  for (const file of files) {
    const recipe = readPaprikaRecipe(await file.read())
    if (!recipe || recipe.in_trash) continue
    found.push({
      ref: paprikaRef(recipe),
      name: cleanText(recipe.name),
      recipe: async () => readPaprikaRecipe(await file.read()),
    })
  }
  return found.length > 0 ? sourceOf(found, zip.close) : null
}

/** One recipe exported on its own (.paprikarecipe), or null if it isn't. */
export function readPaprikaFile(file: Buffer) {
  const recipe = readPaprikaRecipe(file)
  if (!recipe || recipe.in_trash) return null
  return sourceOf(
    [
      {
        ref: paprikaRef(recipe),
        name: cleanText(recipe.name),
        recipe: async () => recipe,
      },
    ],
    () => {}
  )
}

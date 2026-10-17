import type { OpenZip } from "../../transfer/zip.ts"
import type { AppCookNote, AppSource } from "../types.ts"
import {
  camelKeys,
  cookNoteOf,
  fromMealie,
  mealieId,
  mealieRef,
  type MealieRecipe,
} from "./recipe.ts"

// Recipes exported from Mealie (select, then Export), rather than a whole
// backup: recipes/<slug>/<slug>.json with the recipe in snake_case, and its
// photos beside it in images/. One recipe's own export is <slug>.json and
// original.webp, with nothing around them.

/** Where a recipe's JSON can be. */
const RECIPE_FILE = /^(?:(.*\/)?recipes\/[^/]+\/)?[^/]+\.json$/

const looksLikeRecipe = (recipe: MealieRecipe) =>
  typeof recipe?.name === "string" &&
  recipe.id &&
  (Array.isArray(recipe.recipeIngredient) ||
    Array.isArray(recipe.recipeInstructions))

/** Reads a recipe export, or says it isn't one. */
export async function readMealieExport(zip: OpenZip) {
  const found: { recipe: MealieRecipe; folder: string }[] = []
  for (const name of zip.names()) {
    const file = name.split("/").pop()!
    if (
      name.startsWith("__MACOSX/") ||
      file.startsWith(".") ||
      file === "database.json" ||
      !RECIPE_FILE.test(name)
    ) {
      continue
    }
    let recipe: MealieRecipe
    try {
      recipe = camelKeys(JSON.parse((await zip.read(name))!.toString("utf8")))
    } catch {
      continue
    }
    if (looksLikeRecipe(recipe)) {
      found.push({ recipe, folder: name.slice(0, -file.length) })
    }
  }
  if (found.length === 0) return null

  /** Its photo: in images/ beside it, or beside it for one recipe's own export. */
  const photo = async (folder: string) =>
    (await zip.read(`${folder}images/original.webp`)) ??
    zip.read(`${folder}original.webp`)

  /** Comments are in the export; people are only ids, so no one's named. */
  const cookNotes = (recipe: MealieRecipe) =>
    (Array.isArray(recipe.comments) ? recipe.comments : [])
      .map((comment: MealieRecipe) =>
        cookNoteOf(comment.text, comment.createdAt, null)
      )
      .filter((note: AppCookNote | null): note is AppCookNote => note !== null)

  return {
    refs: found.map(({ recipe }) => mealieRef(recipe.id)),
    source(): AppSource {
      return {
        app: "mealie",
        total: found.length,
        async *recipes() {
          for (const { recipe, folder } of found) {
            yield {
              ref: mealieRef(mealieId(recipe.id)),
              name: String(recipe.name),
              read: async () => ({
                ...fromMealie(recipe),
                createdBy: null,
                cookNotes: cookNotes(recipe),
                photo: () => photo(folder),
              }),
            }
          }
        },
        close: zip.close,
      }
    },
  }
}

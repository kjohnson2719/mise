import type { EntityManager } from "@mikro-orm/sql"
import { createRecipe } from "../recipes.ts"
import { tidyAfterImport } from "../review/tidy-run.ts"
import {
  photoContent,
  readRecipe,
  textContent,
  type AiDeps,
} from "./ai-reader.ts"

// Recipes from what AI reads: pasted text, and photos of a recipe.

/** Adds the recipe in some text, read by AI. */
export async function importText(
  em: EntityManager,
  deps: AiDeps,
  options: {
    householdId: string
    userId: string | null
    text: string
    /** Where it's from, when that's a page. */
    sourceUrl?: string | null
  }
) {
  const input = await readRecipe(deps, em, {
    householdId: options.householdId,
    userId: options.userId,
    content: textContent(options.text),
    source: "text",
    sourceUrl: options.sourceUrl ?? null,
  })
  const recipe = await createRecipe(em, {
    householdId: options.householdId,
    userId: options.userId,
    input,
    origin: "text",
  })
  await tidyAfterImport(em, { ...options, recipeId: recipe.id })
  return recipe
}

/** Adds the recipe in up to four photos, read by AI as one. */
export async function importPhotos(
  em: EntityManager,
  deps: AiDeps,
  options: {
    householdId: string
    userId: string | null
    photos: Buffer[]
  }
) {
  const input = await readRecipe(deps, em, {
    householdId: options.householdId,
    userId: options.userId,
    content: await photoContent(options.photos),
    source: "photos",
  })
  const recipe = await createRecipe(em, {
    householdId: options.householdId,
    userId: options.userId,
    input,
    origin: "photo",
  })
  await tidyAfterImport(em, { ...options, recipeId: recipe.id })
  return recipe
}

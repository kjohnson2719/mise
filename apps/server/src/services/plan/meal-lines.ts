import {
  leftOutLines,
  pairingFactor,
  type AvoidedFood,
  type ListLine,
} from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import type {
  PlanEntry,
  Recipe,
  RecipeIngredient,
} from "../../database/entities/index.ts"
import { NOT_DELETED_FILTER } from "../../database/scope.ts"
import { toNumber } from "../recipes/recipes.ts"
import { getTastes } from "./preferences.ts"

// What a planned meal takes: its recipe's ingredient lines, and its
// side's, scaled to its servings, less what's left out for someone who
// doesn't like it. The list shops for them; cooking uses them from the
// pantry.

/** What it takes to work out a meal's lines: its recipes and their lines. */
const POPULATE = ["recipe.ingredients", "withRecipe.ingredients"] as const

/**
 * Loads meals' recipes and lines, Recently deleted ones too, and the
 * household's dislikes: what each meal takes, from `mealLines`.
 */
export async function loadMealLines(
  em: EntityManager,
  householdId: string,
  entries: readonly PlanEntry[]
) {
  await em.populate([...entries], POPULATE, {
    filters: { [NOT_DELETED_FILTER]: false },
  })
  const { avoid } = await getTastes(em, householdId)
  return (entry: PlanEntry) => mealLines(entry, avoid)
}

/** A recipe's lines in order, less what's left out. */
function linesOf(recipe: Recipe, avoid: readonly AvoidedFood[]) {
  const lines = recipe.ingredients
    .getItems()
    .sort((a, b) => a.position - b.position)
  const without = leftOutLines(
    {
      name: recipe.name,
      lines: lines.map((line) => line.rawText),
      marks: lines.map((line) => line.mark ?? null),
      needs: recipe.needs,
    },
    avoid
  )
  return lines.filter((_, index) => !without.has(index)) as RecipeIngredient[]
}

/** Whether a meal's recipe can be cooked: it has one, not in Recently deleted. */
export function hasRecipe(entry: PlanEntry) {
  const recipe = entry.recipe?.getEntity()
  return Boolean(recipe && !recipe.deletedAt)
}

/**
 * A planned meal's ingredient lines, scaled to its servings, and its side's,
 * scaled to match as on the recipe page, less what's left out for the
 * household's dislikes. Its recipes are loaded.
 */
export function mealLines(
  entry: PlanEntry,
  avoid: readonly AvoidedFood[] = []
): ListLine[] {
  const recipe = entry.recipe!.getEntity()
  const servings = toNumber(recipe.servings)
  const planned = toNumber(entry.servings)
  const factor = planned && servings ? planned / servings : 1
  const lines: ListLine[] = linesOf(recipe, avoid).map((line) => ({
    text: line.rawText,
    factor,
    source: recipe.name,
    food: line.foodKey ?? null,
    meal: entry.id,
  }))
  const side = entry.withRecipe?.getEntity()
  if (side && !side.deletedAt) {
    const sideFactor = pairingFactor(
      { servings },
      { servings: toNumber(side.servings) },
      factor
    )
    for (const line of linesOf(side, avoid)) {
      lines.push({
        text: line.rawText,
        factor: sideFactor,
        source: side.name,
        food: line.foodKey ?? null,
        meal: entry.id,
      })
    }
  }
  return lines
}

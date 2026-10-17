import {
  applyDietOverrides,
  DIETS,
  dietsFor,
  type Diet,
  type DietOverrides,
} from "@merran/shared"
import type { Recipe } from "../../database/entities/index.ts"

// A recipe's diet labels are kept with it as ",vegetarian,gluten-free,", so
// the recipes with a label are found with `like '%,vegan,%'` on either
// database.

export function encodeDiets(diets: readonly Diet[]) {
  return diets.length > 0 ? `,${diets.join(",")},` : ""
}

export function decodeDiets(stored: string | null | undefined): Diet[] {
  return DIETS.filter((diet) => stored?.includes(`,${diet},`))
}

/** The pattern for recipes with a label. */
export const withDiet = (diet: Diet) => ({ $like: `%,${diet},%` })

export function overridesOf(recipe: Recipe): DietOverrides {
  return (recipe.dietOverrides ?? {}) as DietOverrides
}

/** Works the labels out again from these ingredient lines, keeping the household's corrections. */
export function workOutDiets(recipe: Recipe, lines: readonly string[]) {
  recipe.diets = encodeDiets(
    applyDietOverrides(dietsFor(lines), overridesOf(recipe))
  )
}

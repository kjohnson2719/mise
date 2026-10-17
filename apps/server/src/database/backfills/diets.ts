import {
  applyDietOverrides,
  dietsFor,
  type DietOverrides,
} from "@merran/shared"

// Run by the migration that added recipes.diets, on SQLite and Postgres: the
// labels for recipes saved before there were any, from their ingredients and
// any corrections. A new database has no recipes, so it does nothing there.

type Execute = (
  sql: string,
  params?: unknown[]
) => Promise<Record<string, unknown>[]>

export async function backfillDiets(execute: Execute) {
  const recipes = await execute("select id, diet_overrides from recipes")
  const lines = await execute(
    "select recipe_id, raw_text from recipe_ingredients order by recipe_id, position"
  )
  const byRecipe = new Map<string, string[]>()
  for (const line of lines) {
    const id = String(line.recipe_id)
    byRecipe.set(id, [...(byRecipe.get(id) ?? []), String(line.raw_text)])
  }
  for (const recipe of recipes) {
    const id = String(recipe.id)
    const stored = recipe.diet_overrides
    // SQLite hands JSON back as text, Postgres as an object.
    const overrides = (
      typeof stored === "string" ? JSON.parse(stored) : (stored ?? {})
    ) as DietOverrides
    const diets = applyDietOverrides(
      dietsFor(byRecipe.get(id) ?? []),
      overrides
    )
    if (diets.length === 0) continue
    await execute("update recipes set diets = ? where id = ?", [
      `,${diets.join(",")},`,
      id,
    ])
  }
}

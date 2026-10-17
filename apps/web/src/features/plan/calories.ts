import type { PlanEntry } from "./queries"

/**
 * Roughly what one person eats from a day's meals: a serving of each (and
 * of what it's made with), skipped meals and notes left out. Null with
 * nothing known; `partial` when a meal's recipe has no nutrition yet.
 */
export function dayCalories(entries: readonly PlanEntry[]) {
  let total = 0
  let known = false
  let partial = false
  for (const entry of entries) {
    if (entry.status === "skipped" || !entry.recipe) continue
    for (const recipe of [entry.recipe, entry.withRecipe]) {
      if (!recipe) continue
      if (recipe.calories === null) {
        partial = true
        continue
      }
      total += recipe.calories
      known = true
    }
  }
  return known ? { total: Math.round(total), partial } : null
}

/** The average over the days with any calories known. */
export function averageCalories(days: readonly (readonly PlanEntry[])[]) {
  const totals = days.flatMap((entries) => {
    const day = dayCalories(entries)
    return day ? [day.total] : []
  })
  if (totals.length === 0) return null
  return Math.round(
    totals.reduce((sum, total) => sum + total, 0) / totals.length
  )
}

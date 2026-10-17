import type { AutoplanRun } from "./autoplan.ts"
import { addDays, weekStartOf, type Meal } from "./days.ts"

// Today, the home page: what it shows, worked out from the plan, the
// household's clock and its recipes.

/** Dinner's planned until then: an idea for tonight isn't offered from 9 pm. */
export const IDEAS_UNTIL_HOUR = 21

/** Favorites made in the last three weeks aren't offered to cook again. */
export const COOK_AGAIN_DAYS = 21

/**
 * The days after today to show, a card each: the rest of this week, or
 * near its end, with fewer than three left, the next three.
 */
export function daysAhead(today: string, weekStartsOn: number) {
  const end = addDays(weekStartOf(today, weekStartsOn), 6)
  const rest: string[] = []
  for (let day = addDays(today, 1); day <= end; day = addDays(day, 1)) {
    rest.push(day)
  }
  return rest.length >= 3
    ? { days: rest, restOfWeek: true }
    : { days: [1, 2, 3].map((n) => addDays(today, n)), restOfWeek: false }
}

/** Dinners first, as the meal most households plan, then lunches, then the rest. */
const OPEN_FIRST: readonly Meal[] = ["dinner", "lunch", "breakfast", "snack"]

/**
 * The first meal from tomorrow to the end of the week with nothing
 * planned, of the meals the household plans: "Thursday's dinner is open".
 */
export function firstOpenMeal(
  entries: readonly { date: string; meal: Meal; anyDay: boolean }[],
  {
    today,
    weekStartsOn,
    meals,
  }: { today: string; weekStartsOn: number; meals: readonly Meal[] }
): { date: string; meal: Meal } | null {
  const end = addDays(weekStartOf(today, weekStartsOn), 6)
  const taken = new Set(
    entries
      .filter((entry) => !entry.anyDay)
      .map((entry) => `${entry.date} ${entry.meal}`)
  )
  for (const meal of OPEN_FIRST.filter((meal) => meals.includes(meal))) {
    for (let day = addDays(today, 1); day <= end; day = addDays(day, 1)) {
      if (!taken.has(`${day} ${meal}`)) return { date: day, meal }
    }
  }
  return null
}

/**
 * Whether Today offers an idea for tonight: the household plans dinner,
 * nothing's on for it today (planned, cooked or skipped), and it isn't
 * 9 pm yet.
 */
export function wantsTonightIdea(
  todays: readonly { meal: Meal; anyDay: boolean }[],
  { hour, meals }: { hour: number; meals: readonly Meal[] }
) {
  return (
    meals.includes("dinner") &&
    hour < IDEAS_UNTIL_HOUR &&
    !todays.some((entry) => !entry.anyDay && entry.meal === "dinner")
  )
}

/**
 * Favorites to cook again: rated four stars or more and not made in three
 * weeks, the best first, then the longest since they were made.
 */
export function cookAgain<
  T extends { rating: number | null; lastMadeAt: string | null },
>(recipes: readonly T[], today: string, limit = 6): T[] {
  const cutoff = addDays(today, -COOK_AGAIN_DAYS)
  const made = (recipe: T) =>
    recipe.lastMadeAt ? Date.parse(recipe.lastMadeAt) : 0
  return recipes
    .filter(
      (recipe) =>
        (recipe.rating ?? 0) >= 4 &&
        (!recipe.lastMadeAt || recipe.lastMadeAt.slice(0, 10) < cutoff)
    )
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || made(a) - made(b))
    .slice(0, limit)
}

/**
 * Whether the autoplan's last run is still news on Today: it planned
 * something, for a week that isn't over, in the last four days.
 */
export function autoplanNews(last: AutoplanRun | null, today: string) {
  if (!last || last.planned === 0) return false
  return (
    addDays(last.week, 6) >= today && addDays(last.at.slice(0, 10), 4) >= today
  )
}

// Days on the plan, kept as "2026-10-15": calendar days with no time zone,
// worked out in the household's own time zone so "today" is the same for
// everyone in it, wherever the server is.

/** The meals a household can plan, in the order a day has them. */
export const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const
export type Meal = (typeof MEALS)[number]

/** What a household plans until it opts out of some: every meal. */
export const DEFAULT_MEALS: readonly Meal[] = MEALS

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/

const toDate = (day: string) => new Date(`${day}T00:00:00Z`)

/** Whether this is a real day, written "2026-10-15". */
export function isDay(value: string) {
  const match = DAY.exec(value)
  if (!match) return false
  const date = toDate(value)
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  )
}

/** A day, so many days on (or back). */
export function addDays(day: string, days: number) {
  const date = toDate(day)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** Days from one day to another: 1 from today to tomorrow. */
export function daysBetween(from: string, to: string) {
  return Math.round(
    (toDate(to).getTime() - toDate(from).getTime()) / 86_400_000
  )
}

/** 0 is Sunday, 6 is Saturday. */
export function dayOfWeek(day: string) {
  return toDate(day).getUTCDay()
}

/** The first day of the week a day is in, for a week starting on `weekStartsOn`. */
export function weekStartOf(day: string, weekStartsOn: number) {
  return addDays(day, -((dayOfWeek(day) - weekStartsOn + 7) % 7))
}

/** The seven days of a week, from its first. */
export function weekDays(weekStart: string) {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
}

/** The day and the hour it is now in a time zone. */
export function clockIn(timeZone: string, now = new Date()) {
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now)
  } catch {
    return clockIn("UTC", now)
  }
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((found) => found.type === type)?.value ?? ""
  return {
    today: `${part("year")}-${part("month")}-${part("day")}`,
    hour: Number(part("hour")) % 24,
  }
}

/** Breakfast until 11, lunch until 3, then dinner until midnight. */
export function mealOfTheHour(hour: number): Meal {
  if (hour < 11) return "breakfast"
  if (hour < 15) return "lunch"
  return "dinner"
}

/** The meals filled for a household, in a day's order: every meal until it opts out. */
export function plannedMeals(
  meals: readonly Meal[] | null | undefined
): Meal[] {
  const picked = MEALS.filter((meal) => meals?.includes(meal))
  return picked.length > 0 ? picked : [...DEFAULT_MEALS]
}

/** A meal on the plan, as far as what's next needs to know. */
export type PlannedMeal = {
  date: string
  meal: Meal
  position: number
  anyDay: boolean
  status: "planned" | "cooked" | "skipped"
}

/**
 * The next meal to cook: the first one still planned from now on (today's
 * meals from the meal of the hour), not a snack and not one in the week's
 * pool. Cooking it, skipping it or the time going by moves it on.
 */
export function nextMeal<T extends PlannedMeal>(
  meals: readonly T[],
  { today, hour }: { today: string; hour: number }
): T | null {
  const now = MEALS.indexOf(mealOfTheHour(hour))
  const ahead = meals.filter(
    (entry) =>
      entry.status === "planned" &&
      !entry.anyDay &&
      entry.meal !== "snack" &&
      (entry.date > today ||
        (entry.date === today && MEALS.indexOf(entry.meal) >= now))
  )
  ahead.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal) ||
      a.position - b.position
  )
  return ahead[0] ?? null
}

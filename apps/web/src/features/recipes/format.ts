import type { TFunction } from "i18next"

/** "45 min", "1 hr", "1 hr 15 min". */
export function formatMinutes(t: TFunction, minutes: number) {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return t("recipes.time.minutes", { count: rest })
  if (rest === 0) return t("recipes.time.hours", { count: hours })
  return t("recipes.time.hoursMinutes", { hours, minutes: rest })
}

/** "www.seriouseats.com/…" → "seriouseats.com". */
export function sourceName(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

/** Amounts of servings the kitchen way: 4, 2.5, ½. */
export function formatServings(servings: number) {
  return Number.isInteger(servings)
    ? String(servings)
    : String(Math.round(servings * 100) / 100)
}

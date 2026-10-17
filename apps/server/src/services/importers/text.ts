import { cleanText, parseDuration } from "../recipes/import/recipe-data.ts"

// Reading the loose text other apps keep: times typed by hand, Markdown,
// links that may not be links. Shared by every importer.

/** A number above 0, or null. */
export const positive = (value: unknown) => {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

/** "1 hour 30 minutes", "1 hr 30 mins", "PT1H30M", "45 min" or "90" is minutes. */
export function readMinutes(value: unknown): number | null {
  if (typeof value === "number") {
    return value > 0 && value <= 100_000 ? Math.round(value) : null
  }
  if (typeof value !== "string" || !value.trim()) return null
  const iso = parseDuration(value)
  if (iso !== null) return iso <= 100_000 ? iso : null
  const text = value.toLowerCase()
  const days = text.match(/(\d+(?:[.,]\d+)?)\s*(?:d|days?)\b/)
  const hours = text.match(/(\d+(?:[.,]\d+)?)\s*(?:h|hrs?|hours?)\b/)
  const minutes = text.match(/(\d+)\s*(?:m|mins?|minutes?)\b/)
  let total: number
  if (days || hours || minutes) {
    const number = (match: RegExpMatchArray | null) =>
      match ? Number(match[1]!.replace(",", ".")) : 0
    total = number(days) * 1440 + number(hours) * 60 + number(minutes)
  } else {
    const plain = text.match(/^\s*(\d+)\s*$/)
    total = plain ? Number(plain[1]) : 0
  }
  return total > 0 && total <= 100_000 ? Math.round(total) : null
}

/** Text of several lines, kept as lines, like notes in Markdown. */
export function plainText(value: unknown) {
  if (typeof value !== "string") return ""
  return value
    .replace(/\r\n?|\u2028|\u2029/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** A web link, or null for anything else. */
export function asLink(raw: unknown) {
  if (typeof raw !== "string" || !raw.trim()) return null
  try {
    const url = new URL(raw.trim())
    return /^https?:$/.test(url.protocol) && url.href.length <= 2000
      ? url.href
      : null
  } catch {
    return null
  }
}

/** 1 to 5 stars, rounded, or null for none. */
export function stars(value: unknown) {
  const rating = positive(value)
  return rating === null ? null : Math.min(5, Math.max(1, Math.round(rating)))
}

/** Tags Merran can take: each once, short enough, 30 at most. */
export function tagList(names: readonly unknown[]) {
  const seen = new Set<string>()
  return names
    .map((tag) => cleanText(tag))
    .filter((tag) => {
      const key = tag.toLowerCase()
      if (!tag || tag.length > 40 || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 30)
}

/** A heading line for the editor, and nothing for none. */
export function heading(title: unknown) {
  const text = cleanText(title).replace(/^#+/, "").trim()
  return text ? [`# ${text.slice(0, 200)}`] : []
}

/** A line that isn't a heading, even if it starts with "#". */
export const notHeading = (text: string, max: number) =>
  text.replace(/^#+\s*/, "").slice(0, max)

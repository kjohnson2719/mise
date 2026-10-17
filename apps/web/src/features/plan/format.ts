import { addDays } from "@merran/shared"

/** A plan day ("2026-10-15") as a date to format, at noon so no zone moves it. */
const asDate = (day: string) => new Date(`${day}T12:00:00Z`)

/** "Thursday, Oct 15", in the reader's language. */
export function formatDay(day: string, language: string) {
  return new Intl.DateTimeFormat(language, {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(asDate(day))
}

/** "Thursday", in the reader's language. */
export function formatWeekday(day: string, language: string) {
  return new Intl.DateTimeFormat(language, {
    weekday: "long",
    timeZone: "UTC",
  }).format(asDate(day))
}

/** "Oct 12 – 18", in the reader's language. */
export function formatWeek(weekStart: string, language: string) {
  return new Intl.DateTimeFormat(language, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).formatRange(asDate(weekStart), asDate(addDays(weekStart, 6)))
}

/** "Thu", in the reader's language. */
export function formatShortWeekday(day: string, language: string) {
  return new Intl.DateTimeFormat(language, {
    weekday: "short",
    timeZone: "UTC",
  }).format(asDate(day))
}

/** "Oct 15", in the reader's language. */
export function formatMonthDay(day: string, language: string) {
  return new Intl.DateTimeFormat(language, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(asDate(day))
}

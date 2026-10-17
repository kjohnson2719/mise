import { addDays, weekDays } from "@merran/shared"

import { formatDay, formatWeek } from "./format"

/** Where a meal goes: a day, or the pool of the week a day starts. */
export type When = { date: string; anyDay: boolean }

export const whenValue = (when: When) =>
  when.anyDay ? `any:${when.date}` : when.date

export const parseWhen = (value: string): When =>
  value.startsWith("any:")
    ? { date: value.slice(4), anyDay: true }
    : { date: value, anyDay: false }

/**
 * The words these need, from the caller's `t`: handing `t` itself on is
 * too deep for TypeScript's checks of i18next's keys.
 */
export type WhenWords = {
  today: string
  language: string
  /** "Today". */
  todayWord: string
  /** "Any day, Oct 12 – 18". */
  anyDayOf: (week: string) => string
}

/** "Today · Thursday, Oct 15", or just the day. */
export function dayLabel(day: string, words: WhenWords) {
  const label = formatDay(day, words.language)
  return day === words.today ? `${words.todayWord} · ${label}` : label
}

/**
 * Where a meal can go, from a week on: each week's pool, then its days,
 * for `weeks` weeks.
 */
export function whenOptions(week: string, words: WhenWords, weeks = 2) {
  return Array.from({ length: weeks }, (_, index) =>
    addDays(week, index * 7)
  ).flatMap((start) => [
    {
      value: `any:${start}`,
      label: words.anyDayOf(formatWeek(start, words.language)),
    },
    ...weekDays(start).map((day) => ({
      value: day,
      label: dayLabel(day, words),
    })),
  ])
}

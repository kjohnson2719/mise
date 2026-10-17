import { addDays, clockIn, dayOfWeek, type Meal } from "./days.ts"

// The weekly autoplan: on the household's chosen day and hour, in its
// time zone, it fills the week ahead's empty meals the way Fill the week
// does, and can put them on the list.

export type AutoplanSettings = {
  enabled: boolean
  /** The day it runs: 0 is Sunday. */
  day: number
  /** The hour it runs, 0 to 23, in the household's time zone. */
  hour: number
  /** The meals it fills. */
  meals: Meal[]
  /** Whether it puts what the week needs on the list too. */
  addToList: boolean
}

/** What a run did, for Settings and Today to say. */
export type AutoplanRun = {
  /** The first day of the week it planned. */
  week: string
  at: string
  /** Meals it filled, of the ones that were empty. */
  planned: number
  empty: number
  /** Lines it put on the list, new or added to. */
  listed: number
}

/** Off to start: Saturday at 9 for the week ahead, dinners, onto the list. */
export const DEFAULT_AUTOPLAN: AutoplanSettings = {
  enabled: false,
  day: 6,
  hour: 9,
  meals: ["dinner"],
  addToList: true,
}

/** The moment a day's hour comes in a time zone. */
export function zonedTime(day: string, hour: number, timeZone: string) {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number]
  const wanted = Date.UTC(y, m - 1, d, hour)
  // Guess, see what the zone's clock says then, and correct by the
  // difference; twice, for the guess crossing a change of clocks.
  let guess = wanted
  for (let i = 0; i < 2; i++) {
    const clock = clockIn(timeZone, new Date(guess))
    const [cy, cm, cd] = clock.today.split("-").map(Number) as [
      number,
      number,
      number,
    ]
    guess += wanted - Date.UTC(cy, cm - 1, cd, clock.hour)
  }
  return new Date(guess)
}

/**
 * When the autoplan next runs after `now`: the next time it's `day` at
 * `hour` in the household's time zone.
 */
export function nextAutoplanRun(
  settings: Pick<AutoplanSettings, "day" | "hour">,
  timeZone: string,
  now = new Date()
) {
  const { today } = clockIn(timeZone, now)
  for (let ahead = 0; ahead <= 7; ahead++) {
    const day = addDays(today, ahead)
    if (dayOfWeek(day) !== settings.day) continue
    const at = zonedTime(day, settings.hour, timeZone)
    if (at > now) return at
  }
  // A week on, if today's hour has gone.
  return zonedTime(addDays(today, 7), settings.hour, timeZone)
}

/**
 * The week a run on `day` plans: the next week starting on or after it.
 * Saturday's run plans the week that starts on Sunday or Monday.
 */
export function autoplanWeek(day: string, weekStartsOn: number) {
  return addDays(day, (weekStartsOn - dayOfWeek(day) + 7) % 7)
}

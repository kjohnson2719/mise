import { describe, expect, test } from "vitest"
import {
  autoplanNews,
  cookAgain,
  daysAhead,
  firstOpenMeal,
  wantsTonightIdea,
} from "./today.ts"

// Friday Oct 16 2026, in a week that starts on Monday.
const friday = "2026-10-16"

describe("Today", () => {
  test("shows the rest of the week, or the next three days near its end", () => {
    // Wednesday: Thursday to Sunday.
    expect(daysAhead("2026-10-14", 1)).toEqual({
      days: ["2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"],
      restOfWeek: true,
    })
    // Friday: only Saturday and Sunday are left, so the next three.
    expect(daysAhead(friday, 1)).toEqual({
      days: ["2026-10-17", "2026-10-18", "2026-10-19"],
      restOfWeek: false,
    })
    // Weeks starting Sunday: Friday has only Saturday left.
    expect(daysAhead(friday, 0).restOfWeek).toBe(false)
  })

  test("finds the first open meal from tomorrow, dinners first", () => {
    const clock = { today: "2026-10-14", weekStartsOn: 1 }
    const dinner = (date: string) => ({
      date,
      meal: "dinner" as const,
      anyDay: false,
    })
    expect(
      firstOpenMeal([dinner("2026-10-15"), dinner("2026-10-16")], {
        ...clock,
        meals: ["lunch", "dinner"],
      })
    ).toEqual({ date: "2026-10-17", meal: "dinner" })
    // Every dinner's planned: the first open lunch.
    const dinners = ["15", "16", "17", "18"].map((day) =>
      dinner(`2026-10-${day}`)
    )
    expect(
      firstOpenMeal(dinners, { ...clock, meals: ["lunch", "dinner"] })
    ).toEqual({
      date: "2026-10-15",
      meal: "lunch",
    })
    expect(firstOpenMeal(dinners, { ...clock, meals: ["dinner"] })).toBeNull()
    // The week's pool isn't any one day's.
    expect(
      firstOpenMeal([{ date: "2026-10-15", meal: "dinner", anyDay: true }], {
        ...clock,
        meals: ["dinner"],
      })
    ).toEqual({ date: "2026-10-15", meal: "dinner" })
  })

  test("offers an idea for tonight until 9 pm, when dinner's open", () => {
    const meals = ["dinner"] as const
    expect(wantsTonightIdea([], { hour: 17, meals })).toBe(true)
    expect(wantsTonightIdea([], { hour: 21, meals })).toBe(false)
    expect(
      wantsTonightIdea([{ meal: "dinner", anyDay: false }], { hour: 17, meals })
    ).toBe(false)
    // A meal from the week's pool isn't tonight's.
    expect(
      wantsTonightIdea([{ meal: "dinner", anyDay: true }], { hour: 17, meals })
    ).toBe(true)
    // A household that doesn't plan dinner.
    expect(wantsTonightIdea([], { hour: 17, meals: ["lunch"] })).toBe(false)
  })

  test("offers favorites not made in three weeks, the best first", () => {
    const recipe = (
      name: string,
      rating: number | null,
      lastMadeAt: string | null
    ) => ({
      name,
      rating,
      lastMadeAt,
    })
    const names = cookAgain(
      [
        recipe("Lately", 5, "2026-10-01T18:00:00Z"),
        recipe("Long ago", 4, "2026-08-01T18:00:00Z"),
        recipe("Never", 5, null),
        recipe("Not a favorite", 3, null),
        recipe("A while", 4, "2026-09-01T18:00:00Z"),
      ],
      friday
    ).map((found) => found.name)
    expect(names).toEqual(["Never", "Long ago", "A while"])
  })

  test("says what the autoplan did while it's news", () => {
    const run = {
      week: "2026-10-19",
      at: "2026-10-17T09:00:00.000Z",
      planned: 6,
      empty: 7,
      listed: 18,
    }
    expect(autoplanNews(run, "2026-10-17")).toBe(true)
    expect(autoplanNews(run, "2026-10-21")).toBe(true)
    // Four days on, it's old news.
    expect(autoplanNews(run, "2026-10-22")).toBe(false)
    expect(autoplanNews({ ...run, planned: 0 }, "2026-10-17")).toBe(false)
    expect(autoplanNews(null, "2026-10-17")).toBe(false)
    // A week that's over.
    expect(autoplanNews({ ...run, week: "2026-10-05" }, "2026-10-17")).toBe(
      false
    )
  })
})

import { describe, expect, test } from "vitest"
import {
  addDays,
  clockIn,
  dayOfWeek,
  daysBetween,
  isDay,
  mealOfTheHour,
  nextMeal,
  plannedMeals,
  weekDays,
  weekStartOf,
  type PlannedMeal,
} from "./days.ts"

describe("days", () => {
  test("are real days, written one way", () => {
    expect(isDay("2026-10-15")).toBe(true)
    expect(isDay("2026-02-30")).toBe(false)
    expect(isDay("2026-10-5")).toBe(false)
    expect(isDay("today")).toBe(false)
  })

  test("count on and back, across months and years", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02")
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31")
    expect(daysBetween("2026-10-15", "2026-10-22")).toBe(7)
    // Thursday.
    expect(dayOfWeek("2026-10-15")).toBe(4)
  })

  test("belong to a week starting on the household's day", () => {
    // A Monday start, and a Sunday one.
    expect(weekStartOf("2026-10-15", 1)).toBe("2026-10-12")
    expect(weekStartOf("2026-10-12", 1)).toBe("2026-10-12")
    expect(weekStartOf("2026-10-18", 1)).toBe("2026-10-12")
    expect(weekStartOf("2026-10-15", 0)).toBe("2026-10-11")
    expect(weekDays("2026-10-12")).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
      "2026-10-18",
    ])
  })

  test("today is the household's, not the server's", () => {
    // 2 a.m. in London is still the evening before in Los Angeles.
    const now = new Date("2026-10-16T01:30:00Z")
    expect(clockIn("Europe/London", now)).toEqual({
      today: "2026-10-16",
      hour: 2,
    })
    expect(clockIn("America/Los_Angeles", now)).toEqual({
      today: "2026-10-15",
      hour: 18,
    })
    expect(clockIn("Not/AZone", now)).toEqual({ today: "2026-10-16", hour: 1 })
  })
})

describe("meals", () => {
  test("go by the hour", () => {
    expect(mealOfTheHour(7)).toBe("breakfast")
    expect(mealOfTheHour(12)).toBe("lunch")
    expect(mealOfTheHour(18)).toBe("dinner")
  })

  test("a household plans every meal, until it opts out", () => {
    const every = ["breakfast", "lunch", "dinner", "snack"]
    expect(plannedMeals(undefined)).toEqual(every)
    expect(plannedMeals([])).toEqual(every)
    expect(plannedMeals(["dinner", "breakfast"])).toEqual([
      "breakfast",
      "dinner",
    ])
  })

  test("what's next is the first still planned from now on", () => {
    const meal = (
      date: string,
      meal: PlannedMeal["meal"],
      extra: Partial<PlannedMeal> = {}
    ): PlannedMeal & { name: string } => ({
      date,
      meal,
      position: 0,
      anyDay: false,
      status: "planned",
      name: `${date} ${meal}`,
      ...extra,
    })
    const plan = [
      meal("2026-10-15", "lunch"),
      meal("2026-10-15", "dinner", { status: "cooked" }),
      meal("2026-10-15", "snack"),
      meal("2026-10-12", "dinner", { anyDay: true }),
      meal("2026-10-16", "dinner", { position: 1 }),
      meal("2026-10-16", "dinner"),
    ]
    // At 4 p.m. lunch is past, dinner's cooked: tomorrow's first dinner.
    expect(nextMeal(plan, { today: "2026-10-15", hour: 16 })?.name).toBe(
      "2026-10-16 dinner"
    )
    expect(nextMeal(plan, { today: "2026-10-15", hour: 16 })?.position).toBe(0)
    // At noon, today's lunch.
    expect(nextMeal(plan, { today: "2026-10-15", hour: 12 })?.name).toBe(
      "2026-10-15 lunch"
    )
    expect(nextMeal(plan, { today: "2026-10-17", hour: 8 })).toBeNull()
  })
})

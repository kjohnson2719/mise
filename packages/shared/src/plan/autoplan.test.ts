import { describe, expect, test } from "vitest"
import { autoplanWeek, nextAutoplanRun, zonedTime } from "./autoplan.ts"

describe("the autoplan", () => {
  test("knows when an hour comes in a time zone", () => {
    // Chicago is five hours behind UTC in October, six in December.
    expect(zonedTime("2026-10-17", 9, "America/Chicago").toISOString()).toBe(
      "2026-10-17T14:00:00.000Z"
    )
    expect(zonedTime("2026-12-19", 9, "America/Chicago").toISOString()).toBe(
      "2026-12-19T15:00:00.000Z"
    )
    expect(zonedTime("2026-10-17", 9, "UTC").toISOString()).toBe(
      "2026-10-17T09:00:00.000Z"
    )
    // Ahead of UTC, the hour comes the day before there.
    expect(zonedTime("2026-10-17", 7, "Pacific/Auckland").toISOString()).toBe(
      "2026-10-16T18:00:00.000Z"
    )
  })

  test("keeps its hour across a change of clocks", () => {
    // Clocks went back in Chicago on Nov 1 2026.
    expect(zonedTime("2026-10-31", 9, "America/Chicago").toISOString()).toBe(
      "2026-10-31T14:00:00.000Z"
    )
    expect(zonedTime("2026-11-07", 9, "America/Chicago").toISOString()).toBe(
      "2026-11-07T15:00:00.000Z"
    )
  })

  test("runs next on its day and hour, a week on once it's gone", () => {
    const saturday9 = { day: 6, hour: 9 }
    // Friday Oct 16: tomorrow.
    expect(
      nextAutoplanRun(saturday9, "UTC", new Date("2026-10-16T12:00:00Z"))
    ).toEqual(new Date("2026-10-17T09:00:00Z"))
    // Saturday before 9: today.
    expect(
      nextAutoplanRun(saturday9, "UTC", new Date("2026-10-17T08:59:00Z"))
    ).toEqual(new Date("2026-10-17T09:00:00Z"))
    // Saturday at 9 or after: next Saturday.
    expect(
      nextAutoplanRun(saturday9, "UTC", new Date("2026-10-17T09:00:00Z"))
    ).toEqual(new Date("2026-10-24T09:00:00Z"))
    // In the household's time zone: Saturday 9 in Chicago is 14:00 UTC.
    expect(
      nextAutoplanRun(
        saturday9,
        "America/Chicago",
        new Date("2026-10-17T13:00:00Z")
      )
    ).toEqual(new Date("2026-10-17T14:00:00Z"))
  })

  test("plans the next week starting on or after its day", () => {
    // Saturday Oct 17: the week from Monday, or from Sunday.
    expect(autoplanWeek("2026-10-17", 1)).toBe("2026-10-19")
    expect(autoplanWeek("2026-10-17", 0)).toBe("2026-10-18")
    // On a week's first day, that week.
    expect(autoplanWeek("2026-10-19", 1)).toBe("2026-10-19")
    // Weeks starting Saturday: the one starting that day.
    expect(autoplanWeek("2026-10-17", 6)).toBe("2026-10-17")
    // Midweek: the next one.
    expect(autoplanWeek("2026-10-21", 1)).toBe("2026-10-26")
  })
})

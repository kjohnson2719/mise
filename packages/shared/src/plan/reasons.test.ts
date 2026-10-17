import { describe, expect, test } from "vitest"
import { reasonsFor, type ReasonRecipe } from "./reasons.ts"

const today = "2026-10-15"
const plain: ReasonRecipe = {
  rating: null,
  totalMinutes: 50,
  lastMadeAt: "2026-10-08",
}
const noTheme = { today, theme: null, weeknightDinner: false }

describe("reasons", () => {
  test("say a recipe was never made, or not had in weeks", () => {
    expect(reasonsFor({ ...plain, lastMadeAt: null }, noTheme)).toEqual([
      { kind: "new" },
    ])
    expect(
      reasonsFor({ ...plain, lastMadeAt: "2026-09-10T00:00:00Z" }, noTheme)
    ).toEqual([{ kind: "notLately", weeks: 5 }])
    // Whole weeks: 34 days is four.
    expect(
      reasonsFor({ ...plain, lastMadeAt: "2026-09-10T18:00:00Z" }, noTheme)
    ).toEqual([{ kind: "notLately", weeks: 4 }])
    // Made two weeks ago isn't a while.
    expect(reasonsFor({ ...plain, lastMadeAt: "2026-10-01" }, noTheme)).toEqual(
      []
    )
  })

  test("say a good rating, of four stars or more", () => {
    expect(reasonsFor({ ...plain, rating: 4 }, noTheme)).toEqual([
      { kind: "rated", stars: 4 },
    ])
    expect(reasonsFor({ ...plain, rating: 3 }, noTheme)).toEqual([])
  })

  test("say quick only for a weeknight dinner", () => {
    const quick = { ...plain, totalMinutes: 25 }
    expect(reasonsFor(quick, { ...noTheme, weeknightDinner: true })).toEqual([
      { kind: "quick", minutes: 25 },
    ])
    expect(reasonsFor(quick, noTheme)).toEqual([])
    expect(
      reasonsFor(
        { ...plain, totalMinutes: 60 },
        { ...noTheme, weeknightDinner: true }
      )
    ).toEqual([])
  })

  test("put the night's theme first, fitted or not", () => {
    expect(
      reasonsFor(
        { ...plain, rating: 5 },
        { ...noTheme, theme: { label: "Taco night", fits: true } }
      )
    ).toEqual([
      { kind: "theme", label: "Taco night" },
      { kind: "rated", stars: 5 },
    ])
    expect(
      reasonsFor(plain, {
        ...noTheme,
        theme: { label: "Fish night", fits: false },
      })
    ).toEqual([{ kind: "themeMissed", label: "Fish night" }])
  })

  test("say what food at home it uses up, after the theme", () => {
    expect(
      reasonsFor(
        { ...plain, rating: 5 },
        {
          ...noTheme,
          theme: { label: "Taco night", fits: true },
          usesUp: ["spinach"],
        }
      )
    ).toEqual([
      { kind: "theme", label: "Taco night" },
      { kind: "usesUp", foods: ["spinach"] },
    ])
  })

  test("say what's on sale it uses, after food to use up", () => {
    expect(
      reasonsFor(
        { ...plain, rating: 5 },
        {
          ...noTheme,
          usesUp: ["spinach"],
          onSale: { foods: ["chicken thighs"], lowest: true },
        }
      )
    ).toEqual([
      { kind: "usesUp", foods: ["spinach"] },
      { kind: "onSale", foods: ["chicken thighs"], lowest: true },
    ])
    expect(
      reasonsFor(plain, { ...noTheme, onSale: { foods: [], lowest: false } })
    ).toEqual([])
  })

  test("give two at most, strongest first", () => {
    expect(
      reasonsFor(
        { rating: 5, totalMinutes: 20, lastMadeAt: null },
        { today, theme: null, weeknightDinner: true }
      )
    ).toEqual([{ kind: "new" }, { kind: "rated", stars: 5 }])
  })

  test("always say what to leave out, after the reasons", () => {
    expect(
      reasonsFor(
        { rating: 5, totalMinutes: 20, lastMadeAt: null },
        {
          today,
          theme: null,
          weeknightDinner: true,
          leaveOut: [{ food: "mushroom", who: "Emma" }],
        }
      )
    ).toEqual([
      { kind: "new" },
      { kind: "rated", stars: 5 },
      { kind: "leaveOut", foods: [{ food: "mushroom", who: "Emma" }] },
    ])
  })
})

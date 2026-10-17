import { describe, expect, test } from "vitest"
import { keep, sameDish } from "./discover.ts"

const found = (name: string, site: string) => ({
  url: `https://${site}/${name.toLowerCase().replace(/\W+/g, "-")}`,
  name,
  site,
  minutes: null,
  photo: null,
  why: "Good.",
})

describe("Discover's picks", () => {
  test("knows two takes on one dish", () => {
    expect(
      sameDish("Sheet Pan Chicken Fajitas", "Easy Sheet Pan Chicken Fajitas")
    ).toBe(true)
    expect(
      sameDish(
        "5-Ingredient Honey Garlic Glazed Salmon",
        "Easy Honey Garlic Salmon"
      )
    ).toBe(true)
    expect(sameDish("Honey Garlic Chicken", "Honey Garlic Salmon")).toBe(false)
    expect(sameDish("Chicken Fajitas", "Steak Fajitas")).toBe(false)
  })

  test("keeps one of each dish", () => {
    const kept = keep([
      found("Sheet Pan Chicken Fajitas", "a.example"),
      found("Sheet Pan Chicken Fajitas", "b.example"),
      found("Easy Sheet Pan Chicken Fajitas", "c.example"),
      found("Honey Garlic Salmon", "d.example"),
      found("Beef Stroganoff", "e.example"),
    ])
    expect(kept.map((recipe) => recipe.name)).toEqual([
      "Sheet Pan Chicken Fajitas",
      "Honey Garlic Salmon",
      "Beef Stroganoff",
    ])
  })
})

import { describe, expect, test } from "vitest"
import { fitsTheme, themeLabel, type ThemeRecipe } from "./themes.ts"

const recipe = (changes: Partial<ThemeRecipe>): ThemeRecipe => ({
  name: "Lemon Chicken",
  tags: [],
  diets: [],
  totalMinutes: 50,
  lastMadeAt: "2026-09-01",
  lines: ["4 chicken thighs", "1 lemon"],
  ...changes,
})

describe("theme labels", () => {
  test("make a night of a food", () => {
    expect(themeLabel({ kind: "tag", name: "Tacos", tag: "taco" })).toBe(
      "Taco night"
    )
    expect(themeLabel({ kind: "tag", name: "Stir-fry", tag: "stir fry" })).toBe(
      "Stir-fry night"
    )
    expect(themeLabel({ kind: "fish", name: "Fish" })).toBe("Fish night")
    expect(themeLabel({ kind: "meatless", name: "Meatless" })).toBe(
      "Meatless night"
    )
  })

  test("keep a word ending in ss whole", () => {
    expect(themeLabel({ kind: "tag", name: "Bass", tag: "bass" })).toBe(
      "Bass night"
    )
  })

  test("leave other themes as named", () => {
    expect(themeLabel({ kind: "new", name: "Something new" })).toBe(
      "Something new"
    )
    expect(themeLabel({ kind: "skip", name: "Eat out" })).toBe("Eat out")
  })
})

describe("fitting a theme", () => {
  const tacos = { kind: "tag", name: "Tacos", tag: "taco" } as const

  test("a tag theme, by a tag or the name, in either number", () => {
    expect(fitsTheme(recipe({ tags: ["tacos"] }), tacos)).toBe(true)
    expect(fitsTheme(recipe({ name: "Fish Tacos" }), tacos)).toBe(true)
    expect(fitsTheme(recipe({ name: "Tacoma Salad" }), tacos)).toBe(false)
    expect(fitsTheme(recipe({}), tacos)).toBe(false)
  })

  test("a tag theme of two words, spaced or hyphenated", () => {
    const stirFry = { kind: "tag", name: "Stir-fry", tag: "stir fry" } as const
    expect(fitsTheme(recipe({ name: "Beef Stir-Fry" }), stirFry)).toBe(true)
    expect(fitsTheme(recipe({ tags: ["stir fries"] }), stirFry)).toBe(true)
  })

  test("meatless, by the vegetarian or vegan label", () => {
    const meatless = { kind: "meatless", name: "Meatless" } as const
    expect(fitsTheme(recipe({ diets: ["vegetarian"] }), meatless)).toBe(true)
    expect(fitsTheme(recipe({ diets: ["vegan"] }), meatless)).toBe(true)
    expect(fitsTheme(recipe({ diets: ["gluten-free"] }), meatless)).toBe(false)
  })

  test("fish, by its name, tags or ingredients", () => {
    const fish = { kind: "fish", name: "Fish" } as const
    expect(fitsTheme(recipe({ name: "Garlic Shrimp" }), fish)).toBe(true)
    expect(fitsTheme(recipe({ tags: ["seafood"] }), fish)).toBe(true)
    expect(
      fitsTheme(
        recipe({ name: "Sheet Pan Dinner", lines: ["2 salmon fillets"] }),
        fish
      )
    ).toBe(true)
    expect(fitsTheme(recipe({}), fish)).toBe(false)
  })

  test("something new, by never being made", () => {
    const fresh = { kind: "new", name: "Something new" } as const
    expect(fitsTheme(recipe({ lastMadeAt: null }), fresh)).toBe(true)
    expect(fitsTheme(recipe({}), fresh)).toBe(false)
  })

  test("something quick, by half an hour or less", () => {
    const quick = { kind: "quick", name: "Something quick" } as const
    expect(fitsTheme(recipe({ totalMinutes: 30 }), quick)).toBe(true)
    expect(fitsTheme(recipe({ totalMinutes: 31 }), quick)).toBe(false)
    expect(fitsTheme(recipe({ totalMinutes: null }), quick)).toBe(false)
  })

  test("nothing, on a skip night", () => {
    const out = { kind: "skip", name: "Eat out" } as const
    expect(fitsTheme(recipe({}), out)).toBe(false)
  })
})

import { describe, expect, test } from "vitest"
import { costShown, packsFor, recipeCost, sizeAmount } from "./costs.ts"
import type { StoreProduct } from "./products.ts"

const product = (
  id: string,
  size: string,
  price: number,
  salePrice: number | null = null
): StoreProduct => ({
  id,
  upc: null,
  name: id,
  brand: null,
  size,
  image: null,
  price,
  salePrice,
  saleEnds: null,
  currency: "USD",
  aisle: null,
  inStock: true,
  url: null,
})

describe("pack sizes", () => {
  test.each([
    ["1 lb", { quantity: 1, unit: "pound" }],
    ["32 oz", { quantity: 32, unit: "ounce" }],
    ["1 gal", { quantity: 1, unit: "gallon" }],
    ["12 fl oz", { quantity: 12, unit: "fluid-ounce" }],
    ["12 ct", { quantity: 12, unit: null }],
    ["6 ct / 12 fl oz", { quantity: 6, unit: null }],
    ["5 lbs", { quantity: 5, unit: "pound" }],
  ])("%s", (size, amount) => {
    expect(sizeAmount(size)).toEqual(amount)
  })

  test("aren't there when it doesn't say", () => {
    expect(sizeAmount("family size")).toBeNull()
    expect(sizeAmount(null)).toBeNull()
  })
})

describe("how many packs", () => {
  test("by weight, volume, a baking staple's density, or count", () => {
    expect(
      packsFor("chicken thigh", { quantity: 2, unit: "pound" }, "1 lb")
    ).toBe(2)
    // A cup of flour is 120 g; a 5 lb bag is 2268 g.
    expect(
      packsFor("all-purpose flour", { quantity: 2, unit: "cup" }, "5 lbs")
    ).toBeCloseTo(240 / 2267.96)
    expect(packsFor("egg", { quantity: 3, unit: null }, "12 ct")).toBe(0.25)
    expect(packsFor("milk", { quantity: 2, unit: "cup" }, "1 gal")).toBeCloseTo(
      0.125
    )
  })

  test("a can or jar is a pack, whatever's in it", () => {
    expect(
      packsFor("diced tomato", { quantity: 2, unit: "can" }, "14.5 oz")
    ).toBe(2)
  })

  test("so many of something sold by weight, by what one weighs", () => {
    // An onion is about 225 g; a 3 lb bag is 1361 g.
    expect(packsFor("onion", { quantity: 2, unit: null }, "3 lb")).toBeCloseTo(
      450 / 1360.78
    )
    // A whole chicken priced by the pound: about 4.4 lb of it.
    expect(
      packsFor("whole chicken", { quantity: 1, unit: null }, "1 lb")
    ).toBeCloseTo(2000 / 453.592)
  })

  test("nothing when they don't compare", () => {
    expect(packsFor("leek", { quantity: 2, unit: null }, "3 lb")).toBeNull()
    expect(packsFor("salt", { quantity: null, unit: null }, "26 oz")).toBeNull()
  })
})

describe("a recipe's cost", () => {
  const products = new Map([
    ["chicken thigh", product("chicken", "1 lb", 599, 399)],
    ["olive oil", product("oil", "16 fl oz", 800)],
    ["lemon", product("lemon", "1 ct", 79)],
  ])
  const productOf = (food: string) => products.get(food)

  test("adds up each line's share of its product, at today's price", () => {
    const cost = recipeCost(
      [
        "2 lb chicken thighs",
        "2 tbsp olive oil",
        "2 lemons, juiced",
        "Salt to taste",
        "1 tsp pepper",
        "1 bunch fresh thyme",
      ],
      productOf,
      { today: "2026-10-16", isOnHand: (name) => /pepper|salt/.test(name) }
    )
    // 2 lb on sale at $3.99, 2 tbsp of 16 fl oz (1/16 of $8), 2 lemons.
    expect(cost).toEqual({
      total: Math.round(2 * 399 + 800 / 16 + 2 * 79),
      counted: 4,
      priced: 3,
      missingMain: false,
      currency: "USD",
    })
    expect(costShown(cost)).toBe(cost)
  })

  test("isn't shown without a price for its meat", () => {
    const cost = recipeCost(
      ["1 lb ground beef", "2 lemons", "2 tbsp olive oil", "2 lemons"],
      productOf,
      { today: "2026-10-16" }
    )
    expect(cost).toMatchObject({ counted: 4, priced: 3, missingMain: true })
    expect(costShown(cost)).toBeNull()
  })

  test("isn't shown with too few lines priced", () => {
    const cost = recipeCost(
      ["2 lb chicken thighs", "1 cup rice", "2 onions", "1 can beans"],
      productOf,
      { today: "2026-10-16" }
    )
    expect(cost).toMatchObject({ counted: 4, priced: 1 })
    expect(costShown(cost)).toBeNull()
  })
})

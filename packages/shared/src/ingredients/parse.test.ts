import { describe, expect, test } from "vitest"
import {
  normalizeIngredientLine,
  parseIngredient,
  plusAmount,
  statedGrams,
} from "./parse.ts"

describe("reading an ingredient line", () => {
  test.each([
    [
      "2 cups all-purpose flour, sifted",
      2,
      null,
      "cup",
      "all-purpose flour",
      "sifted",
    ],
    ["1 1/2 tsp salt", 1.5, null, "teaspoon", "salt", null],
    ["1½ cups milk", 1.5, null, "cup", "milk", null],
    ["½ cup sugar", 0.5, null, "cup", "sugar", null],
    ["2-3 cloves garlic, minced", 2, 3, "clove", "garlic", "minced"],
    ["2 to 3 tbsp olive oil", 2, 3, "tablespoon", "olive oil", null],
    [
      "1 (14.5 oz) can diced tomatoes",
      1,
      null,
      "can",
      "diced tomatoes",
      "14.5 oz",
    ],
    ["200g butter, softened", 200, null, "gram", "butter", "softened"],
    ["1 lb. ground beef", 1, null, "pound", "ground beef", null],
    ["3 large eggs", 3, null, null, "large eggs", null],
    ["1 T soy sauce", 1, null, "tablespoon", "soy sauce", null],
    ["1 t vanilla extract", 1, null, "teaspoon", "vanilla extract", null],
    ["8 fl oz chicken stock", 8, null, "fluid-ounce", "chicken stock", null],
    ["a pinch of salt", 1, null, "pinch", "salt", null],
    [
      "2 sprigs fresh thyme (optional)",
      2,
      null,
      "sprig",
      "fresh thyme",
      "optional",
    ],
    ["1,5 l water", 1.5, null, "liter", "water", null],
    ["- 1 cup rice", 1, null, "cup", "rice", null],
    ["▢ 2 tablespoons butter", 2, null, "tablespoon", "butter", null],
    // Another way to measure it isn't part of the food.
    ["½ cup (75 g) butter", 0.5, null, "cup", "butter", "75 g"],
    [
      "1 cup (2 sticks) butter, softened",
      1,
      null,
      "cup",
      "butter",
      "2 sticks, softened",
    ],
    [
      "1½ cups plus 1 Tbsp. (200 g) flour",
      1.5,
      null,
      "cup",
      "flour",
      "plus 1 Tbsp., 200 g",
    ],
    ["1 cup / 240 ml milk", 1, null, "cup", "milk", "240 ml"],
    ["2 cups (packed) brown sugar", 2, null, "cup", "brown sugar", "packed"],
  ])("%s", (line, quantity, quantityMax, unitId, food, note) => {
    const parsed = parseIngredient(line)
    expect(parsed.quantity).toBeCloseTo(quantity)
    expect(parsed.quantityMax).toBe(quantityMax)
    expect(parsed.unitId).toBe(unitId)
    expect(parsed.food).toBe(food)
    expect(parsed.note).toBe(note)
  })

  test("a line without an amount is all food", () => {
    expect(parseIngredient("Salt and pepper, to taste")).toMatchObject({
      quantity: null,
      unitId: null,
      food: "Salt and pepper",
      note: "to taste",
    })
    expect(parseIngredient("a few basil leaves")).toMatchObject({
      quantity: null,
      food: "basil leaves",
      note: "a few",
    })
  })

  test.each([
    ["Pinch of salt", "salt", "Pinch"],
    ["Large pinch of kosher salt", "kosher salt", "Large pinch"],
    ["a drizzle of olive oil", "olive oil", "a drizzle"],
    ["a few sprigs of thyme", "thyme", "a few sprigs"],
    ["a couple cloves garlic, minced", "garlic", "a couple cloves, minced"],
    ["a little olive oil", "olive oil", "a little"],
    ["Splash of milk", "milk", "Splash"],
    ["(75 g) butter", "butter", "75 g"],
    // Not measures: the food itself.
    ["Cream of tartar", "Cream of tartar", null],
    ["Juice of 1 lemon", "Juice of 1 lemon", null],
    ["Large eggs", "Large eggs", null],
    ["Head lettuce", "Head lettuce", null],
  ])("a measure without a number isn't the food: %s", (line, food, note) => {
    expect(parseIngredient(line)).toMatchObject({
      quantity: null,
      unitId: null,
      food,
      note,
    })
  })

  test("its parts put back together are the line", () => {
    for (const line of [
      "1 (14.5 oz) can diced tomatoes",
      "2 cups flour",
      "a pinch of salt",
      "3 eggs",
      "½ cup (75 g) butter",
      "1 cup plus 2 tbsp flour",
    ]) {
      const { text, parts } = parseIngredient(line)
      expect(
        parts && parts.quantity + parts.between + parts.unit + parts.rest
      ).toBe(text)
    }
  })

  test("describing words before a comma stay with the food", () => {
    expect(
      parseIngredient(
        "1 1/2 pounds skinless, boneless chicken thighs, cut into 1 1/2-inch pieces"
      )
    ).toMatchObject({
      quantity: 1.5,
      unitId: "pound",
      food: "skinless boneless chicken thighs",
      note: "cut into 1 1/2-inch pieces",
    })
    expect(parseIngredient("2 large, ripe avocados, halved")).toMatchObject({
      food: "large ripe avocados",
      note: "halved",
    })
    expect(parseIngredient("1 onion, diced")).toMatchObject({
      food: "onion",
      note: "diced",
    })
    expect(parseIngredient("4 cups vegetable oil, for frying")).toMatchObject({
      food: "vegetable oil",
      note: "for frying",
    })
  })
})

test("lines are tidied: fractions spelled out, bullets gone", () => {
  expect(normalizeIngredientLine("•  1¾  cups   flour")).toBe(
    "1 3/4 cups flour"
  )
})

test("a line's own weight in grams is found", () => {
  expect(statedGrams("1½ cups plus 1 Tbsp. (200 g) flour")).toMatchObject({
    grams: 200,
  })
  expect(statedGrams("1½ sticks (1½ sticks; 169 g) butter")?.grams).toBe(169)
  expect(statedGrams("2 cups flour")).toBeNull()
})

test("an extra amount after 'plus' is found", () => {
  expect(plusAmount(" plus 1 Tbsp. flour")).toEqual({
    quantity: 1,
    unitId: "tablespoon",
    length: 13,
  })
  expect(plusAmount(" flour")).toBeNull()
})

import { describe, expect, test } from "vitest"
import { siteNutrition } from "../recipes/import/recipe-data.ts"
import { parseFood } from "./fdc.ts"
import { guessCandidate } from "./nutrition.ts"

describe("guessCandidate", () => {
  test("picks the plain food over the thing made of it", () => {
    const chicken = [
      { fdcId: 1, description: "Chicken, skin (drumsticks and thighs), raw" },
      { fdcId: 2, description: "Chicken, thigh, meat only, raw" },
      { fdcId: 3, description: "DENNY'S, chicken thighs, breaded" },
    ]
    expect(guessCandidate("chicken thighs", chicken)?.fdcId).toBe(2)
  })

  test("is null when nothing is that food", () => {
    expect(
      guessCandidate("saffron", [{ fdcId: 9, description: "Rice, white, raw" }])
    ).toBeNull()
  })
})

describe("parseFood", () => {
  test("reads energy by either id, and household portions", () => {
    const food = parseFood({
      fdcId: 5,
      description: "Onions, raw",
      dataType: "Foundation",
      foodNutrients: [
        { nutrient: { id: 2047 }, amount: 44 },
        { nutrient: { id: 1063 }, amount: 4.2 },
        { nutrient: { id: 1093 }, amount: 4 },
      ],
      foodPortions: [
        {
          amount: 1,
          gramWeight: 160,
          measureUnit: { name: "cup" },
          modifier: "chopped",
        },
        { amount: 1, gramWeight: 0, measureUnit: { name: "cup" } },
        {
          amount: 1,
          gramWeight: 50,
          portionDescription: "Quantity not specified",
        },
      ],
    })
    expect(food.nutrients).toEqual({
      calories: 44,
      protein: null,
      carbs: null,
      fat: null,
      fiber: null,
      sugar: 4.2,
      sodium: 4,
    })
    expect(food.portions).toEqual([
      { label: "cup, chopped", amount: 1, grams: 160 },
    ])
  })
})

describe("siteNutrition", () => {
  test("reads a serving's values, in the units Merran keeps", () => {
    expect(
      siteNutrition({
        "@type": "NutritionInformation",
        calories: "412 calories",
        proteinContent: "31.5 g",
        fatContent: "28g",
        sodiumContent: "0.64 g",
        sugarContent: "1200 mg",
      })
    ).toEqual({
      source: "site",
      calories: 412,
      protein: 31.5,
      fat: 28,
      sodium: 640,
      sugar: 1.2,
    })
    expect(siteNutrition({ "@type": "NutritionInformation" })).toBeNull()
    expect(siteNutrition("lots")).toBeNull()
  })
})

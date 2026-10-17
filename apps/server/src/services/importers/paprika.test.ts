import { gzipSync } from "node:zlib"
import { describe, expect, test } from "vitest"
import { fromPaprika, readPaprikaRecipe } from "./paprika.ts"

const recipe = {
  uid: "0F1A8A6E-6D0B-4E1F-9C59-1B0C2E3F4A5B",
  name: "Lemon Chicken\n",
  description: "Bright and easy.",
  ingredients:
    "4 chicken thighs\n2 lemons\n\nFor the sauce:\n1 tbsp honey\n2 tbsp butter",
  directions:
    "1. Zest the lemons.\n\n2. Roast the chicken\nfor 40 minutes.\n\nFor the sauce:\n\n3. Melt the butter with the honey.",
  notes: "Use bone-in.",
  nutritional_info: "Calories: 450\nProtein: 38 g",
  difficulty: "Easy",
  servings: "4 servings",
  prep_time: "15 mins",
  cook_time: "40 mins",
  total_time: "55 mins",
  source: "Example Kitchen",
  source_url: "https://example.com/lemon-chicken",
  categories: ["Dinner", "Chicken", "dinner"],
  rating: 4,
  created: "2023-06-01 09:30:00",
  photo_data: null,
}

describe("a Paprika recipe", () => {
  test("comes over with its sections, steps and the rest", () => {
    const { input, createdAt, cookNotes, nutrition } = fromPaprika(recipe, null)
    expect(input).toEqual({
      name: "Lemon Chicken",
      description: "Bright and easy.",
      servings: 4,
      yieldText: null,
      prepMinutes: 15,
      cookMinutes: 40,
      totalMinutes: 55,
      // What Merran has no place for goes in the notes.
      notes:
        "Use bone-in.\n\nNutrition:\nCalories: 450\nProtein: 38 g\n\nDifficulty: Easy",
      sourceUrl: "https://example.com/lemon-chicken",
      rating: 4,
      tags: ["Dinner", "Chicken"],
      ingredients: [
        "4 chicken thighs",
        "2 lemons",
        "# For the sauce",
        "1 tbsp honey",
        "2 tbsp butter",
      ],
      steps: [
        "Zest the lemons.",
        "Roast the chicken for 40 minutes.",
        "# For the sauce",
        "Melt the butter with the honey.",
      ],
    })
    expect(createdAt?.toISOString()).toBe("2023-06-01T09:30:00.000Z")
    expect(cookNotes).toEqual([])
    expect(nutrition).toBeNull()
  })

  test("with directions a line each, has a step each", () => {
    const { input } = fromPaprika(
      { ...recipe, directions: "Zest the lemons.\nRoast the chicken." },
      null
    )
    expect(input.steps).toEqual(["Zest the lemons.", "Roast the chicken."])
  })

  test("names where it's from when it has no link", () => {
    const { input } = fromPaprika(
      {
        ...recipe,
        source_url: "",
        notes: "",
        nutritional_info: "",
        difficulty: "",
      },
      null
    )
    expect(input).toMatchObject({
      sourceUrl: null,
      notes: "From Example Kitchen",
    })
  })

  test("reads what it makes, and no rating as none", () => {
    const { input } = fromPaprika(
      { ...recipe, servings: "Makes 2 loaves", rating: 0 },
      null
    )
    expect(input).toMatchObject({
      servings: 2,
      yieldText: "2 loaves",
      rating: null,
    })
  })

  test("is read from gzipped JSON, and nothing else", () => {
    expect(readPaprikaRecipe(gzipSync(JSON.stringify(recipe)))?.name).toBe(
      "Lemon Chicken\n"
    )
    expect(readPaprikaRecipe(Buffer.from(JSON.stringify(recipe)))).toBeNull()
    expect(readPaprikaRecipe(gzipSync("not json"))).toBeNull()
  })
})

import { describe, expect, test } from "vitest"
import {
  camelKeys,
  fromMealie,
  ingredientLine,
  mealieDate,
  mealieId,
} from "./recipe.ts"

describe("Mealie's values", () => {
  test("ids are dashed, as on Postgres and in photo folders", () => {
    expect(mealieId("945c1294d8a84f91a09114854680dc6e")).toBe(
      "945c1294-d8a8-4f91-a091-14854680dc6e"
    )
    expect(mealieId("945C1294-D8A8-4F91-A091-14854680DC6E")).toBe(
      "945c1294-d8a8-4f91-a091-14854680dc6e"
    )
  })

  test("times without a zone are UTC, and dates are midnight", () => {
    expect(mealieDate("2024-03-19T19:55:20.806364")?.toISOString()).toBe(
      "2024-03-19T19:55:20.806Z"
    )
    expect(mealieDate("2024-03-19T19:55:20+00:00")?.toISOString()).toBe(
      "2024-03-19T19:55:20.000Z"
    )
    expect(mealieDate("2024-03-19")?.toISOString()).toBe(
      "2024-03-19T00:00:00.000Z"
    )
    expect(mealieDate("not a date")).toBeNull()
    expect(mealieDate(null)).toBeNull()
  })
})

describe("Mealie's ingredients", () => {
  const cup = { name: "cup", pluralName: "cups", abbreviation: "c" }

  test("parsed ones are put back together", () => {
    expect(
      ingredientLine({
        quantity: 2,
        unit: cup,
        food: { name: "flour" },
        note: "sifted",
      })
    ).toBe("2 cups flour, sifted")
    expect(
      ingredientLine({ quantity: 0.5, unit: cup, food: { name: "milk" } })
    ).toBe("½ cup milk")
    expect(
      ingredientLine({
        quantity: 3,
        food: { name: "egg", pluralName: "eggs" },
      })
    ).toBe("3 eggs")
    expect(
      ingredientLine({
        quantity: 1,
        unit: {
          name: "tablespoon",
          abbreviation: "tbsp",
          useAbbreviation: true,
        },
        food: { name: "butter" },
      })
    ).toBe("1 tbsp butter")
  })

  test("unparsed ones are their note, without Mealie's made-up 1", () => {
    expect(ingredientLine({ quantity: 1, note: "A pinch of salt" })).toBe(
      "A pinch of salt"
    )
    expect(ingredientLine({ originalText: "2 large onions" })).toBe(
      "2 large onions"
    )
  })

  test("amounts are left off when the recipe turns them off", () => {
    expect(
      ingredientLine({ quantity: 2, unit: cup, food: { name: "rice" } }, true)
    ).toBe("cup rice")
  })
})

describe("a Mealie recipe", () => {
  const recipe = {
    id: "945c1294d8a84f91a09114854680dc6e",
    name: "  Lemon Chicken ",
    description: "<p>Bright and easy.</p>",
    recipeIngredient: [
      {
        title: "For the chicken",
        quantity: 4,
        food: { name: "chicken thigh", pluralName: "chicken thighs" },
      },
      { note: "# 2 lemons" },
      { title: "Sauce", note: "1 tbsp honey" },
    ],
    recipeInstructions: [
      { title: "Prep", text: "Zest the lemons." },
      { text: "Roast for 40 minutes." },
    ],
    notes: [
      { title: "Tip", text: "Use bone-in." },
      { title: "", text: "Good cold." },
    ],
    tags: [{ name: "Dinner" }, { name: "Easy" }],
    recipeCategory: [{ name: "dinner" }, { name: "Chicken" }],
    recipeServings: 4,
    recipeYieldQuantity: 0,
    recipeYield: "",
    prepTime: "15 minutes",
    performTime: "40 minutes",
    totalTime: "55 minutes",
    orgURL: "https://example.com/lemon-chicken",
    rating: 4.5,
    lastMade: "2024-05-01T18:00:00",
    dateAdded: "2023-01-02",
    createdAt: "2023-01-02T10:00:00",
    updatedAt: "2024-05-01T18:00:00",
    nutrition: {
      calories: "450 kcal",
      proteinContent: "38 g",
      sodiumContent: "",
    },
  }

  test("comes over with its sections, times and the rest", () => {
    const { input, nutrition, lastMadeAt, createdAt } = fromMealie(recipe)
    expect(input).toMatchObject({
      name: "Lemon Chicken",
      description: "Bright and easy.",
      servings: 4,
      yieldText: null,
      prepMinutes: 15,
      cookMinutes: 40,
      totalMinutes: 55,
      sourceUrl: "https://example.com/lemon-chicken",
      rating: 5,
      notes: "Tip: Use bone-in.\n\nGood cold.",
      // Categories are tags too, without doubling one that's both.
      tags: ["Dinner", "Easy", "Chicken"],
      ingredients: [
        "# For the chicken",
        "4 chicken thighs",
        // A line isn't a heading just because it starts with "#".
        "2 lemons",
        "# Sauce",
        "1 tbsp honey",
      ],
      steps: ["# Prep", "Zest the lemons.", "Roast for 40 minutes."],
    })
    expect(nutrition).toEqual({ source: "site", calories: 450, protein: 38 })
    expect(lastMadeAt?.toISOString()).toBe("2024-05-01T18:00:00.000Z")
    expect(createdAt?.toISOString()).toBe("2023-01-02T10:00:00.000Z")
  })

  test("reads the yield both ways Mealie has kept it", () => {
    // Mealie 2.3 and later: split up.
    expect(
      fromMealie({
        ...recipe,
        recipeServings: 0,
        recipeYieldQuantity: 24,
        recipeYield: "cookies",
      }).input
    ).toMatchObject({ servings: null, yieldText: "24 cookies" })
    // Before: one text.
    const older = {
      ...recipe,
      recipeServings: undefined,
      recipeYieldQuantity: undefined,
    }
    expect(
      fromMealie({ ...older, recipeYield: "6 servings" }).input
    ).toMatchObject({
      servings: 6,
      yieldText: null,
    })
    expect(
      fromMealie({ ...older, recipeYield: "2 loaves" }).input
    ).toMatchObject({
      servings: 2,
      yieldText: "2 loaves",
    })
  })

  test("leaves out what doesn't fit", () => {
    const { input } = fromMealie({
      name: "",
      orgURL: "not a link",
      rating: 0,
      tags: [{ name: "x".repeat(41) }],
    })
    expect(input).toMatchObject({
      name: "Untitled recipe",
      sourceUrl: null,
      rating: null,
      tags: [],
      ingredients: [],
      steps: [],
    })
  })

  test("exports in snake_case read the same", () => {
    const exported = camelKeys({
      name: "Soup",
      org_url: "https://example.com/soup",
      recipe_ingredient: [{ note: "1 onion", original_text: null }],
      perform_time: "20 minutes",
    })
    expect(fromMealie(exported).input).toMatchObject({
      sourceUrl: "https://example.com/soup",
      ingredients: ["1 onion"],
      cookMinutes: 20,
    })
  })
})

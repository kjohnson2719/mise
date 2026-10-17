import { describe, expect, test } from "vitest"
import {
  pairedRecipeLines,
  pairingFactor,
  pairRecipes,
  type PairPart,
} from "./pairing.ts"

const chicken: PairPart = {
  id: "chicken",
  name: "Chicken + Rice",
  servings: 4,
  totalMinutes: 40,
  diets: ["gluten-free", "dairy-free", "nut-free"],
  ingredients: [
    { id: "c1", section: null, text: "4 chicken thighs" },
    { id: "c2", section: null, text: "1 cup rice" },
  ],
  steps: [{ id: "cs1", section: null, text: "Roast the chicken." }],
}

const sauce: PairPart = {
  id: "sauce",
  name: "Teriyaki Sauce",
  servings: 2,
  totalMinutes: 10,
  diets: ["vegetarian", "vegan", "dairy-free", "nut-free"],
  ingredients: [{ id: "s1", section: "Glaze", text: "2 tbsp soy sauce" }],
  steps: [{ id: "ss1", section: "Glaze", text: "Simmer the sauce." }],
}

describe("pairing two recipes", () => {
  test("makes enough of the pairing for the same servings", () => {
    expect(pairingFactor(chicken, sauce)).toBe(2)
    expect(pairingFactor(chicken, sauce, 1.5)).toBe(3)
    // Without servings on both, a batch with a batch.
    expect(pairingFactor(chicken, { servings: null }, 2)).toBe(2)
  })

  test("puts the pairing first, each part under its own heading", () => {
    const both = pairRecipes(chicken, sauce)

    expect(both.ingredients.map((line) => [line.section, line.text])).toEqual([
      ["Teriyaki Sauce · Glaze", "2 tbsp soy sauce"],
      ["Chicken + Rice", "4 chicken thighs"],
      ["Chicken + Rice", "1 cup rice"],
    ])
    expect(both.steps.map((step) => step.section)).toEqual([
      "Teriyaki Sauce · Glaze",
      "Chicken + Rice",
    ])
    expect(both.steps.map((step) => step.from)).toEqual(["sauce", "chicken"])
    expect(both.factors.get("s1")).toBe(2)
    expect(both.factors.get("c1")).toBe(1)
  })

  test("keeps only the diet labels both have, and adds up the time", () => {
    const both = pairRecipes(chicken, sauce)
    expect(both.diets).toEqual(["dairy-free", "nut-free"])
    expect(both.totalMinutes).toBe(50)
  })

  test("can be saved as a recipe of its own, the pairing scaled", () => {
    expect(pairedRecipeLines(chicken, sauce)).toEqual({
      servings: 4,
      totalMinutes: 50,
      ingredients: [
        "# Teriyaki Sauce · Glaze",
        "4 tbsp soy sauce",
        "# Chicken + Rice",
        "4 chicken thighs",
        "1 cup rice",
      ],
      steps: [
        "# Teriyaki Sauce · Glaze",
        "Simmer the sauce.",
        "# Chicken + Rice",
        "Roast the chicken.",
      ],
    })
  })
})

import { describe, expect, test } from "vitest"
import {
  displayIngredient,
  formatQuantity,
  scaleIngredient,
} from "./display.ts"

const shown = (
  line: string,
  options: Parameters<typeof displayIngredient>[1]
) => {
  const { amount, rest } = displayIngredient(line, options)
  return amount + rest
}

describe("amounts the kitchen way", () => {
  test.each([
    [1.5, "1 ½"],
    [0.25, "¼"],
    [1 / 3, "⅓"],
    [2, "2"],
    [0.999, "1"],
    [2.4, "2 ⅜"],
    [24.4, "24"],
    [0.05, "0.05"],
  ])("%s is %s", (value, expected) => {
    expect(formatQuantity(value)).toBe(expected)
  })

  test("metric amounts stay decimal", () => {
    expect(formatQuantity(1.5, { metric: true })).toBe("1.5")
    expect(formatQuantity(2.4, { metric: true })).toBe("2.4")
    expect(formatQuantity(312.5, { metric: true })).toBe("313")
  })
})

describe("scaling", () => {
  test("multiplies the amount and keeps the rest of the line", () => {
    expect(scaleIngredient("1 cup flour, sifted", 2)).toBe(
      "2 cups flour, sifted"
    )
    expect(scaleIngredient("2 cups milk", 0.5)).toBe("1 cup milk")
    expect(scaleIngredient("1 1/2 tsp salt", 2)).toBe("3 tsp salt")
    expect(scaleIngredient("2-3 cloves garlic", 2)).toBe("4–6 cloves garlic")
    expect(scaleIngredient("1 (14.5 oz) can tomatoes", 2)).toBe(
      "2 (14.5 oz) cans tomatoes"
    )
    expect(scaleIngredient("250 g butter", 1.5)).toBe("375 g butter")
    expect(scaleIngredient("a pinch of salt", 2)).toBe("2 pinches of salt")
  })

  test("leaves lines without an amount alone", () => {
    expect(scaleIngredient("Salt to taste", 3)).toBe("Salt to taste")
  })

  test("writes amounts the kitchen way even when not scaled", () => {
    expect(scaleIngredient("1 1/2 lb chicken thighs", 1)).toBe(
      "1 ½ lb chicken thighs"
    )
    expect(scaleIngredient("2-3 cloves garlic", 1)).toBe("2–3 cloves garlic")
    expect(scaleIngredient("1.5 l water", 1)).toBe("1.5 l water")
    expect(scaleIngredient("a pinch of salt", 1)).toBe("a pinch of salt")
  })
})

describe("metric", () => {
  test("weighs baking staples", () => {
    expect(shown("1 cup all-purpose flour", { system: "metric" })).toBe(
      "120 g all-purpose flour"
    )
    expect(shown("2 sticks butter, softened", { system: "metric" })).toBe(
      "226 g butter, softened"
    )
  })

  test("measures other liquids in ml or litres", () => {
    expect(shown("1 cup chicken stock", { system: "metric" })).toBe(
      "240 ml chicken stock"
    )
    expect(shown("1 gallon water", { system: "metric" })).toBe("3.79 l water")
    expect(shown("1 quart chicken stock", { system: "metric" })).toBe(
      "950 ml chicken stock"
    )
  })

  test("weighs in grams or kilograms", () => {
    expect(shown("1 lb ground beef", { system: "metric" })).toBe(
      "454 g ground beef"
    )
    expect(shown("3 lb chuck roast", { system: "metric" })).toBe(
      "1.36 kg chuck roast"
    )
  })

  test("uses the recipe's own grams when it gives them", () => {
    expect(
      shown("1½ cups plus 1 Tbsp. (200 g) flour", { system: "metric" })
    ).toBe("200 g flour")
  })

  test("counts 'plus' amounts in", () => {
    expect(shown("1 cup plus 2 tbsp heavy cream", { system: "metric" })).toBe(
      "270 ml heavy cream"
    )
  })

  test("leaves spoons, counts and metric alone", () => {
    for (const line of ["1 tbsp olive oil", "3 eggs", "200 g sugar", "Salt"]) {
      expect(shown(line, { system: "metric" })).toBe(
        shown(line, { system: "written" })
      )
    }
  })

  test("scales first", () => {
    expect(
      shown("1 cup all-purpose flour", { system: "metric", factor: 2 })
    ).toBe("240 g all-purpose flour")
    expect(shown("2-3 lb potatoes", { system: "metric" })).toBe(
      "907–1361 g potatoes"
    )
  })
})

describe("US", () => {
  test("measures liquids in spoons and cups", () => {
    expect(shown("250 ml milk", { system: "us" })).toBe("1 cup milk")
    expect(shown("15 ml lemon juice", { system: "us" })).toBe(
      "1 tbsp lemon juice"
    )
    expect(shown("5 ml vanilla extract", { system: "us" })).toBe(
      "1 tsp vanilla extract"
    )
  })

  test("turns baking staples into cups", () => {
    expect(shown("240 g all-purpose flour", { system: "us" })).toBe(
      "2 cups all-purpose flour"
    )
    // By any of its names: Parmigiano is parmesan.
    expect(shown("100 g parmigiano reggiano", { system: "us" })).toBe(
      "1 cup parmigiano reggiano"
    )
  })

  test("weighs other things in ounces or pounds", () => {
    expect(shown("100 g pancetta", { system: "us" })).toBe("3 ½ oz pancetta")
    expect(shown("1 kg chicken thighs", { system: "us" })).toBe(
      "2 ¼ lb chicken thighs"
    )
  })

  test("leaves US amounts alone", () => {
    expect(shown("2 cups milk", { system: "us" })).toBe("2 cups milk")
  })
})

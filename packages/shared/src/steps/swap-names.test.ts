import { describe, expect, test } from "vitest"

import { swapNames } from "./swap-names.ts"

describe("a step following a swap", () => {
  test("names the stand-in where it named the ingredient", () => {
    expect(
      swapNames("Stir in the tomato paste and cook 3 minutes.", {
        from: "tomato paste",
        to: "tomato sauce",
      })
    ).toEqual({
      text: "Stir in the tomato sauce and cook 3 minutes.",
      swapped: true,
    })
  })

  test("by its last word, singular or plural, keeping a capital", () => {
    expect(
      swapNames("Add the cream. Cream should just simmer.", {
        from: "heavy cream",
        to: "milk",
      }).text
    ).toBe("Add the milk. Milk should just simmer.")
    expect(
      swapNames("Halve the lemons and squeeze them.", {
        from: "lemon",
        to: "lime",
      }).text
    ).toBe("Halve the lime and squeeze them.")
  })

  test("leaves another ingredient's name alone", () => {
    expect(
      swapNames("Beat the butter, then the peanut butter.", {
        from: "butter",
        to: "margarine",
        others: ["peanut butter", "flour"],
      }).text
    ).toBe("Beat the margarine, then the peanut butter.")
    expect(
      swapNames("Fold in the sour cream.", {
        from: "heavy cream",
        to: "milk",
        others: ["sour cream"],
      })
    ).toEqual({ text: "Fold in the sour cream.", swapped: false })
  })

  test("only whole words", () => {
    expect(
      swapNames("Pour the oil into the boiling water.", {
        from: "oil",
        to: "butter",
      }).text
    ).toBe("Pour the butter into the boiling water.")
    expect(swapNames("Add the peas.", { from: "pea", to: "corn" }).text).toBe(
      "Add the corn."
    )
    expect(
      swapNames("Slice the peach.", { from: "pea", to: "corn" }).swapped
    ).toBe(false)
  })
})

import { describe, expect, test } from "vitest"
import { foodKey } from "../list/food.ts"
import { guessStorage, guessUseBy, whyUseSoon } from "./pantry.ts"

const today = "2026-10-15"

describe("pantry keys", () => {
  test("match a food whatever's been done to it", () => {
    expect(foodKey("Boneless skinless chicken thighs")).toBe("chicken thigh")
    expect(foodKey("chicken thigh")).toBe("chicken thigh")
    expect(foodKey("extra-virgin olive oil")).toBe("olive oil")
    expect(foodKey("shredded cheddar")).toBe("cheddar")
  })

  test("keep different foods apart", () => {
    expect(foodKey("cream cheese")).not.toBe(foodKey("cheese"))
  })
})

describe("where things are kept", () => {
  test("is guessed from the aisle and the food", () => {
    expect(guessStorage("chicken thighs", "meat-seafood")).toBe("fridge")
    expect(guessStorage("milk", "dairy-eggs")).toBe("fridge")
    expect(guessStorage("spinach", "produce")).toBe("fridge")
    expect(guessStorage("onions", "produce")).toBe("cupboard")
    expect(guessStorage("bananas", "produce")).toBe("cupboard")
    expect(guessStorage("frozen peas", "produce")).toBe("freezer")
    expect(guessStorage("ice cream", "frozen")).toBe("freezer")
    expect(guessStorage("rice", "pantry")).toBe("cupboard")
    expect(guessStorage("something", null)).toBe("cupboard")
  })
})

describe("use-by guesses", () => {
  test("are for fresh food, by how long it keeps", () => {
    expect(guessUseBy("chicken thighs", "meat-seafood", "fridge", today)).toBe(
      "2026-10-18"
    )
    expect(guessUseBy("spinach", "produce", "fridge", today)).toBe("2026-10-22")
    expect(guessUseBy("sourdough", "bakery", "cupboard", today)).toBe(
      "2026-10-20"
    )
  })

  test("are none for food that keeps, or the freezer", () => {
    expect(guessUseBy("onions", "produce", "cupboard", today)).toBeNull()
    expect(guessUseBy("rice", "pantry", "cupboard", today)).toBeNull()
    expect(
      guessUseBy("chicken thighs", "meat-seafood", "freezer", today)
    ).toBeNull()
    expect(guessUseBy("milk", null, "fridge", today)).toBeNull()
  })
})

describe("using soon", () => {
  const fresh = {
    useBy: null,
    storedIn: "fridge" as const,
    aisle: "produce" as const,
    meals: [],
  }

  test("is for a use-by date that's close, or gone", () => {
    expect(whyUseSoon({ ...fresh, useBy: "2026-10-17" }, today)).toEqual({
      kind: "soon",
      date: "2026-10-17",
    })
    expect(whyUseSoon({ ...fresh, useBy: "2026-10-14" }, today)).toEqual({
      kind: "past",
      date: "2026-10-14",
    })
    expect(whyUseSoon({ ...fresh, useBy: "2026-10-20" }, today)).toBeNull()
  })

  test("is for fresh food bought for meals that didn't happen", () => {
    const skipped = { date: "2026-10-14", status: "skipped" as const }
    const missed = { date: "2026-10-13", status: "planned" as const }
    const coming = { date: "2026-10-16", status: "planned" as const }
    expect(whyUseSoon({ ...fresh, meals: [skipped] }, today)).toEqual({
      kind: "leftover",
    })
    expect(whyUseSoon({ ...fresh, meals: [missed] }, today)).toEqual({
      kind: "leftover",
    })
    // Still to come: it's for that.
    expect(whyUseSoon({ ...fresh, meals: [skipped, coming] }, today)).toBeNull()
    // Rice keeps, and so does the freezer.
    expect(
      whyUseSoon({ ...fresh, aisle: "pantry", meals: [skipped] }, today)
    ).toBeNull()
    expect(
      whyUseSoon({ ...fresh, storedIn: "freezer", meals: [skipped] }, today)
    ).toBeNull()
  })
})

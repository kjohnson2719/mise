import { describe, expect, test } from "vitest"
import { gramsFor, weighable, type Portion } from "./grams.ts"

const grams = (line: string, portions: Portion[] = [], known = {}) => {
  const amount = weighable(line)
  if (!amount) throw new Error(`${line} isn't weighable`)
  const value = gramsFor(amount, portions, known)
  return value === null ? null : Math.round(value * 10) / 10
}

describe("weighable", () => {
  test("leaves out what doesn't count", () => {
    expect(weighable("Salt to taste")).toBeNull()
    expect(weighable("2 cups water")).toBeNull()
    expect(weighable("# Sauce")).toBeNull()
    expect(weighable("")).toBeNull()
  })

  test("reads the food, kept as matches are", () => {
    expect(weighable("2-3 chopped onions")).toMatchObject({
      name: "chopped onions",
      key: "onion",
      quantity: 2.5,
    })
  })
})

describe("gramsFor", () => {
  test("goes by the line's own weight first", () => {
    expect(grams("1 ½ cups (200 g) flour")).toBe(200)
    expect(grams("1 lb chicken thighs")).toBe(453.6)
    expect(grams("1 (15 oz) can black beans")).toBe(425.2)
  })

  test("weighs baking staples as bakers do", () => {
    expect(grams("2 cups all-purpose flour")).toBe(240)
    expect(grams("1 cup plus 2 tbsp sugar")).toBe(222.8)
  })

  test("uses USDA's portions for volumes and counts", () => {
    const onion: Portion[] = [
      { label: "cup, chopped", amount: 1, grams: 160 },
      { label: 'medium (2-1/2" dia)', amount: 1, grams: 110 },
      { label: "large", amount: 1, grams: 150 },
    ]
    expect(grams("1 cup chopped onion", onion)).toBe(160)
    expect(grams("2 onions", onion)).toBe(220)
    expect(grams("1 large onion", onion)).toBe(150)
    const garlic: Portion[] = [{ label: "clove", amount: 1, grams: 3 }]
    expect(grams("4 cloves garlic", garlic)).toBe(12)
  })

  test("then what one was found to weigh before, or nothing", () => {
    expect(grams("2 lemons", [], { each: 58 })).toBe(116)
    expect(grams("2 lemons")).toBeNull()
    expect(grams("A handful of basil")).toBeNull()
  })
})

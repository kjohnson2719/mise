import { describe, expect, test } from "vitest"
import { aislesFor, guessAisle } from "./aisles.ts"
import {
  addAmounts,
  combineLines,
  formatAmount,
  readAmount,
  readItem,
  subtractAmounts,
} from "./amounts.ts"
import { foodKey, lineFood, shoppingName } from "./food.ts"
import { DEFAULT_ON_HAND, onHandTest, tidyOnHand } from "./on-hand.ts"

describe("food keys", () => {
  test("match the same food however it's written", () => {
    expect(foodKey("2 Large Onions".replace(/^\d+ /, ""))).toBe("onion")
    expect(foodKey("onion")).toBe("onion")
    expect(foodKey("fresh basil leaves")).toBe("basil")
    expect(foodKey("tomatoes")).toBe("tomato")
    // A measure or another amount isn't the food.
    expect(foodKey("Pinch of salt")).toBe("salt")
    expect(foodKey("(75 g) butter")).toBe("butter")
    expect(foodKey("can of chickpeas")).toBe("chickpea")
    expect(foodKey("berries")).toBe("berry")
    expect(foodKey("chickpeas (drained)")).toBe("chickpea")
    expect(foodKey("asparagus")).toBe("asparagus")
  })

  test("join what's the same thing to buy", () => {
    expect(foodKey("plain flour")).toBe("all-purpose flour")
    expect(foodKey("all purpose flour")).toBe("all-purpose flour")
    expect(foodKey("lemon wedges")).toBe("lemon")
    expect(foodKey("garlic cloves")).toBe("garlic")
    expect(foodKey("chopped parsley")).toBe("parsley")
    expect(foodKey("finely chopped fresh flat-leaf parsley")).toBe("parsley")
    expect(foodKey("icing sugar")).toBe(foodKey("confectioners' sugar"))
    expect(foodKey("unsalted butter")).toBe("butter")
    expect(foodKey("extra-virgin olive oil")).toBe("olive oil")
    expect(foodKey("minced beef")).toBe("ground beef")
    expect(foodKey("beef mince")).toBe("ground beef")
    expect(foodKey("minced garlic")).toBe("garlic")
    // Still apart: what's sold that way is its own thing.
    expect(foodKey("diced tomatoes")).not.toBe(foodKey("tomatoes"))
    expect(foodKey("red onion")).not.toBe(foodKey("onion"))
  })

  test("come from an ingredient line, without how much", () => {
    expect(lineFood("2 cloves garlic, minced")).toEqual({
      name: "garlic",
      key: "garlic",
    })
    expect(lineFood("Salt to taste")?.key).toBe("salt")
  })
})

describe("shopping names", () => {
  test.each([
    ["lemon wedges to serve", "lemon wedges"],
    ["caster sugar to serve", "caster sugar"],
    ["sunflower or vegetable oil plus a little extra", "sunflower oil"],
    ["butter or margarine", "butter"],
    ["chicken or vegetable stock", "chicken stock"],
    ["salt and/or pepper", "salt"],
    ["chopped parsley", "parsley"],
    ["large potatoes", "potatoes"],
    ["large green bell peppers", "green bell peppers"],
    ["finely chopped fresh parsley", "parsley"],
    ["diced chicken breast", "chicken breast"],
    ["Pinch of salt", "salt"],
    ["(75 g) butter", "butter"],
    // Sold that way: kept.
    ["large eggs", "large eggs"],
    ["diced tomatoes", "diced tomatoes"],
    ["grated parmesan", "grated parmesan"],
    ["crushed red pepper flakes", "crushed red pepper flakes"],
    ["jumbo shrimp", "jumbo shrimp"],
    ["Cream of tartar", "Cream of tartar"],
  ])("%s is %s", (food, name) => {
    expect(shoppingName(food)).toBe(name)
  })
})

describe("adding up the list", () => {
  test("combines the same food, converting volumes", () => {
    const [milk] = combineLines([
      { text: "1 cup milk", factor: 1, source: "Pancakes", meal: "a" },
      { text: "4 tbsp milk", factor: 1, source: "Gravy", meal: "b" },
    ])
    expect(milk).toMatchObject({
      food: "milk",
      quantity: 1.25,
      unit: "cup",
      sources: ["Pancakes", "Gravy"],
      shares: [
        { meal: "a", quantity: 1, unit: "cup" },
        { meal: "b", quantity: 0.25, unit: "cup" },
      ],
    })
  })

  test("keeps counts apart from weights, and scales by servings", () => {
    const items = combineLines([
      { text: "2 cans diced tomatoes", factor: 1.5, source: "Chili" },
      { text: "1 lb tomatoes", factor: 1, source: "Salad" },
    ])
    expect(items.map((item) => [item.food, item.quantity, item.unit])).toEqual([
      ["diced tomato", 3, "can"],
      ["tomato", 1, "pound"],
    ])
  })

  test("names the food alone, so it's one line and the store finds it", () => {
    const items = combineLines([
      { text: "½ cup (75 g) butter", factor: 1, source: "Cookies" },
      { text: "2 tbsp butter", factor: 1, source: "Toast" },
      { text: "Pinch of salt", factor: 1, source: "Cookies" },
      { text: "1 tsp salt", factor: 1, source: "Toast" },
    ])
    expect(items.map((item) => [item.name, item.quantity, item.unit])).toEqual([
      ["butter", 0.625, "cup"],
      ["salt", 1, "teaspoon"],
    ])
  })

  test("joins a food's ways of being named and measured", () => {
    const items = combineLines([
      { text: "1 head garlic", factor: 1, source: "Roast" },
      { text: "6 cloves garlic, minced", factor: 1, source: "Pasta" },
      { text: "4 lemons", factor: 1, source: "Roast" },
      { text: "Lemon wedges, to serve", factor: 1, source: "Fish" },
      { text: "2 tbsp chopped parsley", factor: 1, source: "Roast" },
      { text: "2 tbsp parsley", factor: 1, source: "Pasta" },
      { text: "1 ½ cups (190 g) all-purpose flour", factor: 1, source: "Cake" },
      { text: "120 g plain flour", factor: 1, source: "Pancakes" },
      { text: "1 stick butter", factor: 1, source: "Cake" },
      { text: "½ cup butter", factor: 1, source: "Cookies" },
    ])
    expect(items.map((item) => [item.name, item.quantity, item.unit])).toEqual([
      ["garlic", 16, "clove"],
      ["lemons", 4, null],
      ["parsley", 4, "tablespoon"],
      // A cup of flour is 120 g: 1 ½ cups and 1 cup.
      ["all-purpose flour", 2.5, "cup"],
      ["butter", 1, "cup"],
    ])
  })

  test("goes back to whole heads of garlic", () => {
    const [garlic] = combineLines([
      { text: "1 head garlic", factor: 1, source: "Roast" },
      { text: "10 cloves garlic", factor: 1, source: "Soup" },
    ])
    expect(garlic).toMatchObject({ quantity: 2, unit: "head" })
  })

  test("buys the top of a range", () => {
    const [garlic] = combineLines([
      { text: "2-3 cloves garlic", factor: 1, source: "Soup" },
    ])
    expect(garlic).toMatchObject({ quantity: 3, unit: "clove" })
  })

  test("lists an as-needed food once, or not at all when it has an amount", () => {
    const items = combineLines([
      {
        text: "Olive oil, for drizzling",
        factor: 1,
        source: "Soup",
        meal: "a",
      },
      { text: "2 tbsp olive oil", factor: 1, source: "Salad", meal: "b" },
      { text: "Parsley, to serve", factor: 1, source: "Soup", meal: "a" },
    ])
    expect(items.map((item) => [item.name, item.quantity])).toEqual([
      ["olive oil", 2],
      ["Parsley", null],
    ])
    // The soup still needs the oil, as part of the line.
    expect(items[0]!.shares.map((share) => share.meal).sort()).toEqual([
      "a",
      "b",
    ])
  })
})

describe("amounts", () => {
  test("add up when they compare", () => {
    expect(
      addAmounts(
        { quantity: 1, unit: "cup" },
        { quantity: 8, unit: "tablespoon" }
      )
    ).toEqual({ quantity: 1.5, unit: "cup" })
    expect(
      addAmounts({ quantity: 2, unit: "can" }, { quantity: 1, unit: "can" })
    ).toEqual({ quantity: 3, unit: "can" })
    expect(
      addAmounts({ quantity: 2, unit: "can" }, { quantity: 1, unit: "pound" })
    ).toBeNull()
    expect(
      addAmounts({ quantity: null, unit: null }, { quantity: null, unit: null })
    ).toEqual({ quantity: null, unit: null })
  })

  test("take away in the first one's unit", () => {
    expect(
      subtractAmounts(
        { quantity: 1.5, unit: "cup" },
        { quantity: 8, unit: "tablespoon" }
      )
    ).toEqual({ quantity: 1, unit: "cup" })
    expect(
      subtractAmounts(
        { quantity: 2, unit: "can" },
        { quantity: 1, unit: "jar" }
      )
    ).toBeNull()
  })

  test("read as typed, and show as people write them", () => {
    expect(readAmount("2 lb")).toEqual({
      quantity: 2,
      unit: "pound",
      amountText: null,
    })
    expect(readAmount("half a bag")).toEqual({
      quantity: null,
      unit: null,
      amountText: "half a bag",
    })
    expect(readItem("2 lb ground beef")).toEqual({
      name: "ground beef",
      quantity: 2,
      unit: "pound",
    })
    expect(readItem("paper towels")).toEqual({
      name: "paper towels",
      quantity: null,
      unit: null,
    })
    expect(formatAmount(1.5, "cup")).toBe("1 ½ cups")
    expect(formatAmount(2, "pound")).toBe("2 lb")
    expect(formatAmount(2, "can")).toBe("2 cans")
    expect(formatAmount(3, null)).toBe("3")
    expect(formatAmount(null, null)).toBe("")
  })
})

describe("always on hand", () => {
  test("covers each thing's kinds", () => {
    const isOnHand = onHandTest(DEFAULT_ON_HAND)
    expect(isOnHand("kosher salt")).toBe(true)
    expect(isOnHand("freshly ground black pepper")).toBe(true)
    expect(isOnHand("salt and pepper")).toBe(true)
    expect(isOnHand("red pepper")).toBe(false)
    expect(isOnHand("cold water")).toBe(true)
    expect(isOnHand("butter")).toBe(false)
  })

  test("is tidied: lowercase, kinds folded, no repeats", () => {
    expect(
      tidyOnHand(["Salt and pepper", "black pepper", " Olive oil ", ""])
    ).toEqual(["salt", "pepper", "olive oil"])
  })
})

describe("aisles", () => {
  test("are named for the household's country", () => {
    expect(aislesFor("GB").slice(0, 2)).toEqual([
      { key: "produce", name: "Fruit & veg" },
      { key: "bakery", name: "Bakery" },
    ])
    expect(aislesFor("us")[0]!.name).toBe("Produce")
    expect(aislesFor(null).at(-1)).toEqual({ key: "other", name: "Other" })
  })

  test("are guessed from the food", () => {
    expect(guessAisle("yellow onions")).toBe("produce")
    expect(guessAisle("red bell pepper")).toBe("produce")
    expect(guessAisle("red pepper flakes")).toBe("spices")
    expect(guessAisle("chicken stock")).toBe("canned-jarred")
    expect(guessAisle("chicken thighs")).toBe("meat-seafood")
    expect(guessAisle("peanut butter")).toBe("condiments")
    expect(guessAisle("eggs")).toBe("dairy-eggs")
    expect(guessAisle("frozen peas")).toBe("frozen")
    expect(guessAisle("vanilla ice cream")).toBe("frozen")
    expect(guessAisle("tomatoes", "can")).toBe("canned-jarred")
    expect(guessAisle("potato chips")).toBe("snacks")
    expect(guessAisle("paper towels")).toBe("household")
    expect(guessAisle("courgettes")).toBe("produce")
    expect(guessAisle("something odd")).toBe("other")
  })
})

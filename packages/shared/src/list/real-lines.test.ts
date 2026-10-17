import { describe, expect, test } from "vitest"
import { combineLines, joinAmounts } from "./amounts.ts"
import { parseIngredient } from "../ingredients/parse.ts"
import { lineFood, lineFoods } from "./food.ts"

// Lines as recipe sites write them, from a household's own recipes: what
// goes on the list for each.

test.each([
  ["3/4 cup green onions (, finely sliced)", "green onions", "green onion"],
  ["400g / 14oz can chickpeas (, drained)", "chickpeas", "chickpea"],
  ["zest of half of a lemon", "lemon", "lemon"],
  [
    "1/2 tsp. Diamond Crystal or 1/4 tsp. Morton kosher salt, plus more",
    "kosher salt",
    "kosher salt",
  ],
  [
    "1/2 medium yellow or white onion, diced ((1/2 medium onion yields ~1 heaping cup or 150 g))",
    "yellow onion",
    "onion",
  ],
  ["1 medium yellow onion (chopped)", "yellow onion", "onion"],
  ["450g carrots peeled and chopped", "carrots", "carrot"],
  ["1 onion chopped", "onion", "onion"],
  ["2 large eggs and 2 large yolks, room temperature", "large eggs", "egg"],
  [
    "handful coriander (about 1/2 a supermarket packet)",
    "coriander",
    "coriander",
  ],
  [
    "1/3 cup Chardonnay or other dry white wine (, substitute chicken stock/broth (Note 5))",
    "Chardonnay",
    "white wine",
  ],
  [
    "2 tbsp Chinese cooking wine (or Taiwanese rice wine (mijiu) if you can find it, or chicken stock/broth (Note 5))",
    "Chinese cooking wine",
    "shaoxing wine",
  ],
  [
    "3/4 cup thickened cream / heavy cream (, or any full fat cream ~35% fat)",
    "thickened cream",
    "heavy cream",
  ],
  ["a small handful of coriander leaves", "coriander leaves", "cilantro"],
  [
    "Coriander leaves (cilantro) (, roughly chopped, recommended)",
    "Coriander leaves",
    "cilantro",
  ],
  ["A lot of garlic (to taste)", "garlic", "garlic"],
  ["1/2 small clove garlic ((or 1/8 tsp garlic powder))", "garlic", "garlic"],
  [
    "3 tbsp oyster sauce ((can substitute with vegetarian oyster sauce))",
    "oyster sauce",
    "oyster sauce",
  ],
  [
    "2 jalapeños (diced, more for topping, if desired)",
    "jalapeños",
    "jalapeño",
  ],
  ["Naan (, optional)", "Naan", "naan"],
  ["1 cup frozen corn* ((or canned, drained))", "frozen corn", "frozen corn"],
  ["2 cups chicken stock/broth (low sodium)", "chicken stock", "chicken stock"],
  ["1 (6 oz) tube can of tomato paste", "tomato paste", "tomato paste"],
  [
    "1 lb beef mince (ground beef) (OR half pork, half beef)",
    "beef mince",
    "ground beef",
  ],
])("%s", (line, name, key) => {
  expect(lineFood(line)).toEqual({ name, key })
})

test("rough amounts, 'and' fractions, and amounts added or taken off", () => {
  expect(parseIngredient("1 and 1/2 cups milk")).toMatchObject({
    quantity: 1.5,
    unitId: "cup",
    food: "milk",
  })
  const heaping = parseIngredient("Heaping ½ teaspoon ground cumin")
  expect(heaping).toMatchObject({ quantity: 0.5, unitId: "teaspoon" })
  expect(
    heaping.parts &&
      heaping.parts.quantity +
        heaping.parts.between +
        heaping.parts.unit +
        heaping.parts.rest
  ).toBe(heaping.text)
  expect(lineFood("About 3 quarts peanut or vegetable oil")).toEqual({
    name: "peanut oil",
    key: "peanut oil",
  })
  expect(lineFood("2 cups minus 2 tablespoons cake flour")?.key).toBe(
    "cake flour"
  )
  expect(lineFood("1/3 cup + 2 tbsp white sugar")?.key).toBe("sugar")
  // "1-1/2" is one and a half, not 1 to ½.
  expect(parseIngredient("1-1/2 tablespoons flour")).toMatchObject({
    quantity: 1.5,
    quantityMax: null,
    unitId: "tablespoon",
  })
  expect(parseIngredient("2-1/2 to 3 pounds veal shanks")).toMatchObject({
    quantity: 2.5,
    quantityMax: 3,
  })
})

test("sizes, packs and boxes around the amount", () => {
  expect(parseIngredient("5 7-inch flour tortillas")).toMatchObject({
    quantity: 5,
    food: "flour tortillas",
    note: "7-inch",
  })
  expect(parseIngredient("1 3-pound boneless turkey breast")).toMatchObject({
    quantity: 1,
    food: "boneless turkey breast",
  })
  expect(parseIngredient("1 (15.25-ounce) box spice cake mix")).toMatchObject({
    quantity: 1,
    unitId: "box",
    food: "spice cake mix",
  })
  expect(
    parseIngredient("2 packed tablespoons light brown sugar")
  ).toMatchObject({
    quantity: 2,
    unitId: "tablespoon",
  })
})

test("names a list kept before they were tidied as the food", () => {
  expect(lineFood("cloves garlic")).toEqual({ name: "garlic", key: "garlic" })
  expect(lineFood("garlic cloves (")).toEqual({
    name: "garlic cloves",
    key: "garlic",
  })
  expect(lineFood("can chickpeas (")?.name).toBe("chickpeas")
  expect(lineFood("corn tortillas*")?.name).toBe("corn tortillas")
})

test("so many of a food and a weight of it are one line, by what one weighs", () => {
  // 450 g of carrots at 70 g each is 6.4 carrots: 13 in all.
  expect(
    combineLines([
      { text: "6 carrots", factor: 1, source: "A" },
      { text: "450g carrots peeled and chopped", factor: 1, source: "B" },
    ]).map((item) => [item.name, item.quantity, item.unit])
  ).toEqual([["carrots", 13, null]])
  // The weight first: in its unit, two onions at 225 g each.
  expect(
    combineLines([
      { text: "1 lb onions", factor: 1, source: "A" },
      { text: "2 onions", factor: 1, source: "B" },
    ]).map((item) => [item.quantity, item.unit])
  ).toEqual([[1.992, "pound"]])
  // And joined onto what's on the list already.
  expect(
    joinAmounts(
      { quantity: 6, unit: null },
      { quantity: 450, unit: "gram" },
      "carrot"
    )
  ).toEqual({ quantity: 13, unit: null })
  // Not for a food Merran doesn't know the weight of.
  expect(
    joinAmounts(
      { quantity: 2, unit: null },
      { quantity: 100, unit: "gram" },
      "leek"
    )
  ).toBeNull()
})

test("garlic however it's measured is one line, in cloves", () => {
  const [garlic, ...rest] = combineLines([
    { text: "2 large cloves garlic, minced", factor: 1, source: "A" },
    { text: "3 garlic cloves (finely chopped)", factor: 1, source: "B" },
    { text: "1 tbsp garlic (minced)", factor: 1, source: "C" },
  ])
  expect(rest).toEqual([])
  expect(garlic).toMatchObject({ name: "garlic", quantity: 8, unit: "clove" })
})

describe("lines naming more than one food", () => {
  const foods = (line: string) =>
    lineFoods(line).map((food) => [food.key, food.quantity, food.unitId])

  test.each([
    [
      "Salt and pepper",
      [
        ["salt", null, null],
        ["black pepper", null, null],
      ],
    ],
    [
      "1/2 tsp EACH dried thyme and oregano",
      [
        ["dried thyme", 0.5, "teaspoon"],
        ["dried oregano", 0.5, "teaspoon"],
      ],
    ],
    [
      "1 tsp each salt, cumin, ground coriander, paprika (sweet, normal or smokey)",
      [
        ["salt", 1, "teaspoon"],
        ["ground cumin", 1, "teaspoon"],
        ["ground coriander", 1, "teaspoon"],
        ["paprika", 1, "teaspoon"],
      ],
    ],
    [
      "2 tbsp olive oil and 1 tbsp butter",
      [
        ["olive oil", 2, "tablespoon"],
        ["butter", 1, "tablespoon"],
      ],
    ],
    // Without "each", the amount is the first one's.
    [
      "1 cup peas and carrots",
      [
        ["pea", 1, "cup"],
        ["carrot", null, null],
      ],
    ],
    [
      "Vegetable oil and unsalted butter, for cooking",
      [
        ["vegetable oil", null, null],
        ["butter", null, null],
      ],
    ],
    // One food, though "and" is in it.
    ["2 tbsp black and white sesame seeds", [["sesame seed", 2, "tablespoon"]]],
    ["1 cup half and half", [["half-and-half", 1, "cup"]]],
    ["1 cup sweet and sour sauce", [["sweet and sour sauce", 1, "cup"]]],
    [
      "2 tablespoons salt and vinegar seasoning, divided",
      [["salt and vinegar seasoning", 2, "tablespoon"]],
    ],
    // Commas without "each" are notes.
    ["1 onion, peeled and chopped", [["onion", 1, null]]],
  ])("%s", (line, expected) => {
    expect(foods(line)).toEqual(expected)
  })

  test("each goes on the list, eggs and yolks as eggs", () => {
    const items = combineLines([
      { text: "Salt and pepper", factor: 1, source: "Soup" },
      { text: "2 large eggs and 2 large yolks", factor: 1, source: "Custard" },
      {
        text: "1/2 tsp each dried thyme and oregano",
        factor: 2,
        source: "Stew",
      },
    ])
    expect(items.map((item) => [item.name, item.quantity, item.unit])).toEqual([
      ["Salt", null, null],
      ["pepper", null, null],
      ["large eggs", 4, null],
      ["dried thyme", 1, "teaspoon"],
      ["dried oregano", 1, "teaspoon"],
    ])
  })
})

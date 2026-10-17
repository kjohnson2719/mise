import { describe, expect, test } from "vitest"
import { BRANDS_EN } from "./data/brands-en.ts"
import { NAMES_EN } from "./data/en.ts"
import { FOODS } from "./data/foods.ts"
import { findFood } from "./vocabulary.ts"

// The vocabulary's data holding together, and finding foods in words.

const wordsOf = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .join(" ")

describe("the data", () => {
  test("names, parents and brands are of foods it knows", () => {
    for (const key of Object.keys(NAMES_EN))
      expect(FOODS, key).toHaveProperty([key])
    for (const [key, facts] of Object.entries(FOODS)) {
      if (facts.parent)
        expect(FOODS, `${key}'s parent`).toHaveProperty([facts.parent])
    }
    for (const key of Object.values(BRANDS_EN.means)) {
      expect(FOODS, key).toHaveProperty([key])
    }
  })

  test("keys are food keys: lowercase", () => {
    for (const key of Object.keys(FOODS)) expect(key).toBe(key.toLowerCase())
  })

  test("most foods have a USDA food, by its FoodData Central id", () => {
    const ids = Object.values(FOODS).flatMap((facts) =>
      facts.fdc === undefined ? [] : [facts.fdc]
    )
    for (const id of ids)
      expect(Number.isInteger(id) && id > 0, `${id}`).toBe(true)
    // Those without are searched for, as foods Merran doesn't know are.
    expect(ids.length / Object.keys(FOODS).length).toBeGreaterThan(0.8)
  })

  test("no name is two foods'", () => {
    const owner = new Map<string, string>()
    const clashes: string[] = []
    for (const key of Object.keys(FOODS)) {
      for (const name of [key, ...(NAMES_EN[key] ?? [])]) {
        const words = wordsOf(name)
        const was = owner.get(words)
        if (was && was !== key) clashes.push(`${name}: ${was} and ${key}`)
        owner.set(words, key)
      }
    }
    expect(clashes).toEqual([])
  })

  test("every food is found by its key and each of its names", () => {
    const missed: string[] = []
    for (const key of Object.keys(FOODS)) {
      for (const name of [key, ...(NAMES_EN[key] ?? [])]) {
        const found = findFood(name)?.key
        if (found !== key) missed.push(`${name}: ${found ?? "nothing"}`)
      }
    }
    expect(missed).toEqual([])
  })
})

describe("finding a food", () => {
  test.each([
    ["all-purpose flour", "all-purpose flour", "all-purpose flour"],
    [
      "King Arthur Unbleached All-Purpose Flour",
      "all-purpose flour",
      "All-Purpose Flour",
    ],
    ["plain flour", "all-purpose flour", "plain flour"],
    ["Diamond Crystal", "kosher salt", "kosher salt"],
    ["Morton kosher salt", "morton kosher salt", "morton kosher salt"],
    ["finely chopped fresh flat-leaf parsley", "parsley", "flat-leaf parsley"],
    ["large eggs", "egg", "large eggs"],
    ["large onions", "onion", "onions"],
    ["dried oregano", "dried oregano", "dried oregano"],
    ["dried porcini mushrooms", "dried mushroom", "dried porcini mushrooms"],
    ["red onion", "red onion", "red onion"],
    ["dark brown sugar", "dark brown sugar", "dark brown sugar"],
    ["light brown sugar", "brown sugar", "light brown sugar"],
    ["vanilla ice cream", "ice cream", "ice cream"],
    ["chicken sausage", "sausage", "sausage"],
    ["salt and black pepper", "black pepper", "black pepper"],
    ["cooked and peeled tiger prawn tails left on", "shrimp", "prawn tails"],
    ["x 400g 14oz cans butter bean", "butter bean", "butter bean"],
    // What comes after "from", "with" or "in" is about the food named.
    [
      "chipotle peppers from a can of chipotles in adobo sauce",
      "chipotle in adobo",
      "chipotle peppers",
    ],
    ["canned tomatoes with green chiles", "diced tomato", "canned tomatoes"],
    [
      "diced tomatoes with green chile peppers",
      "diced tomato and green chile",
      "diced tomatoes with green chile peppers",
    ],
    ["tuna in olive oil", "tuna", "tuna"],
    ["lemon juice from 1 lemon", "lemon juice", "lemon juice"],
    // The food is said last: whole-milk yogurt is yogurt.
    ["plain whole-milk strained yogurt", "yogurt", "yogurt"],
    ["whole-milk feta", "feta", "feta"],
    ["cream cheese", "cream cheese", "cream cheese"],
    // Words after a food that make it something else.
    ["salt and vinegar seasoning", null, null],
    ["crisp rice cereal", "rice cereal", "crisp rice cereal"],
    ["celery seeds", "celery seed", "celery seeds"],
    ["egg roll wrappers", "egg roll wrapper", "egg roll wrappers"],
    ["gochujang paste", "gochujang", "gochujang"],
    ["taco seasoning mix", "taco seasoning", "taco seasoning"],
    // Peppers, more than one, are bell peppers.
    ["frozen peppers", "frozen bell pepper", "frozen peppers"],
    [
      "chocolate sandwich cookies",
      "chocolate sandwich cookie",
      "chocolate sandwich cookies",
    ],
    ["boneless skinless chicken breasts", "chicken breast", "chicken breasts"],
    ["jalapeños", "jalapeño", "jalapeños"],
    ["red chillies", "red chili", "red chillies"],
    ["tinned tomatoes", "diced tomato", "tinned tomatoes"],
    ["confectioners' sugar", "powdered sugar", "confectioners' sugar"],
  ])("%s", (text, key, name) => {
    expect(findFood(text)).toEqual(key === null ? null : { key, name })
  })

  test("nothing it doesn't know", () => {
    expect(findFood("gochugaru")).toBeNull()
    expect(findFood("easy green salad")).toBeNull()
  })
})

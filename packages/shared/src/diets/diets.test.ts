import { describe, expect, test } from "vitest"

import {
  applyDietOverrides,
  dietConflicts,
  dietsFor,
  keptOverrides,
  type Diet,
} from "./diets.ts"

const ALL: Diet[] = [
  "vegetarian",
  "vegan",
  "gluten-free",
  "dairy-free",
  "egg-free",
  "nut-free",
]
const without = (...out: Diet[]) => ALL.filter((d) => !out.includes(d))

describe("dietsFor", () => {
  test.each<[string, string[], Diet[]]>([
    [
      "cookies",
      ["2 cups all-purpose flour", "1 cup sugar", "1/2 cup butter", "2 eggs"],
      ["vegetarian", "nut-free"],
    ],
    [
      "squash soup",
      ["1 butternut squash", "1 tsp nutmeg", "1 cup vegetable broth"],
      ALL,
    ],
    ["chili", ["1 lb ground beef", "1 onion"], without("vegetarian", "vegan")],
    [
      "plain stock might be chicken",
      ["2 cups stock", "1 cup rice"],
      without("vegetarian", "vegan"),
    ],
    [
      "vegetable broth and chicken still has chicken",
      ["1 cup vegetable broth and 1 lb chicken"],
      without("vegetarian", "vegan"),
    ],
    [
      "Worcestershire has anchovies",
      ["1 tbsp Worcestershire sauce", "1 onion"],
      without("vegetarian", "vegan"),
    ],
    [
      "noodles",
      ["8 oz rice noodles", "2 tbsp tamari", "1 cup peanuts"],
      without("nut-free"),
    ],
    [
      "soy sauce has wheat",
      ["1 tbsp soy sauce", "1 lb tofu"],
      without("gluten-free"),
    ],
    ["corn tortillas", ["corn tortillas", "black beans", "salsa"], ALL],
    ["flour tortillas", ["8 tortillas", "black beans"], without("gluten-free")],
    [
      "oats need saying so",
      ["1 cup rolled oats", "1 cup almond milk"],
      without("gluten-free", "nut-free"),
    ],
    ["gluten-free oats", ["1 cup gluten-free oats", "1 cup oat milk"], ALL],
    [
      "peanut butter isn't dairy",
      ["1 cup creamy peanut butter"],
      without("nut-free"),
    ],
    [
      "butternut squash with butter",
      ["1 butternut squash, cubed", "2 tbsp butter"],
      without("vegan", "dairy-free"),
    ],
    [
      "honey isn't vegan",
      ["1/4 cup honey", "1 cup coconut yogurt"],
      without("vegan"),
    ],
    ["eggplant and vegan mayo", ["1 eggplant", "2 tbsp vegan mayo"], ALL],
    [
      "pesto has cheese and nuts",
      ["1/2 cup pesto", "1 lb gluten-free pasta"],
      without("vegan", "dairy-free", "nut-free"),
    ],
    ["water chestnuts", ["1 can water chestnuts", "1 cup rice"], ALL],
    [
      "beef mince",
      ["500g beef mince", "1 onion"],
      without("vegetarian", "vegan"),
    ],
  ])("%s", (_, lines, diets) => {
    expect(dietsFor(lines)).toEqual(diets)
  })

  test("says nothing without ingredients", () => {
    expect(dietsFor([])).toEqual([])
    expect(dietsFor(["", "  "])).toEqual([])
  })

  test("says nothing about words it can't read", () => {
    // A bagel kept in Arabic: flour and honey, which it can't see.
    expect(
      dietsFor([
        "25 جرامًا من بادئ العجين المخمر",
        "450 جرامًا من دقيق الخبز",
        "20 جرامًا من العسل",
      ])
    ).toEqual([])
    // A word or two in another script is fine.
    expect(dietsFor(["2 cups rice", "1 tbsp 味醂 (mirin)", "salt"])).toEqual(
      without()
    )
  })
})

describe("dietConflicts", () => {
  test("names the lines that rule each diet out", () => {
    const conflicts = dietConflicts([
      "2 tbsp butter",
      "1 cup chicken stock",
      "1 onion",
    ])
    expect(conflicts.vegetarian).toEqual(["1 cup chicken stock"])
    expect(conflicts.vegan).toEqual(["2 tbsp butter", "1 cup chicken stock"])
    expect(conflicts["dairy-free"]).toEqual(["2 tbsp butter"])
    expect(conflicts["gluten-free"]).toEqual([])
  })
})

describe("applyDietOverrides", () => {
  test("adds and takes away", () => {
    expect(
      applyDietOverrides(["vegetarian", "nut-free"], {
        "nut-free": false,
        "gluten-free": true,
      })
    ).toEqual(["vegetarian", "gluten-free"])
  })

  test("keeps only corrections that differ from the ingredients", () => {
    expect(
      keptOverrides(["vegetarian", "nut-free"], {
        vegetarian: true,
        "nut-free": false,
        vegan: true,
      })
    ).toEqual({ "nut-free": false, vegan: true })
  })
})

describe("in a language without its own words yet", () => {
  test("goes by the English words", () => {
    expect(dietsFor(["1 lb chicken"], "fr")).toEqual(
      without("vegetarian", "vegan")
    )
  })
})

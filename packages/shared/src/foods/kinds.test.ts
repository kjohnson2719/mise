import { expect, test } from "vitest"
import { covers, kindOf } from "./kinds.ts"

// What stands in for what: a kind for the food it's a kind of, never the
// other way, and only what's shelved with it.

test("a kind is met by what it's a kind of", () => {
  expect(kindOf("green bell pepper")).toEqual(["bell pepper"])
  expect(kindOf("morton kosher salt")).toEqual(["kosher salt", "salt"])
  // A color said before it.
  expect(kindOf("yellow corn")).toEqual(["corn"])
})

test("the pantry's kind covers a recipe's food, not the other way", () => {
  expect(covers("green bell pepper", "bell pepper")).toBe(true)
  expect(covers("red onion", "onion")).toBe(true)
  expect(covers("bell pepper", "green bell pepper")).toBe(false)
  expect(covers("red bell pepper", "green bell pepper")).toBe(false)
  expect(covers("onion", "onion")).toBe(true)
})

test("not what's made another way, or from it", () => {
  // Dried apricots aren't fresh ones; frozen corn isn't fresh corn.
  expect(covers("dried apricot", "apricot")).toBe(false)
  expect(covers("frozen corn", "corn")).toBe(false)
  expect(covers("dried lime", "lime")).toBe(false)
  // Lemon juice is made from lemons, not a kind of one.
  expect(covers("lemon juice", "lemon")).toBe(false)
  // Ro-Tel has chiles in.
  expect(covers("diced tomato and green chile", "diced tomato")).toBe(false)
})

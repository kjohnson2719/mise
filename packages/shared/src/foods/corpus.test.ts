import { expect, test } from "vitest"
import { foodInLine, foodKey } from "../list/food.ts"
import english from "./corpus/en.txt?raw"

// The corpus (corpus/en.txt): ingredient lines as sites write them, and the
// food each is about. Each must come out as written there, and most must
// be foods the vocabulary knows. See docs/foods.md.

/** The share of the corpus's lines that are foods Merran knows. */
const COVERAGE = 0.95

const corpus = english
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"))
  .map((line) => {
    const [text, expected] = line.split(" => ")
    if (!text || !expected) throw new Error(`Not "line => food": ${line}`)
    const unknown = expected.startsWith("?")
    return { text, key: unknown ? expected.slice(1) : expected, unknown }
  })

test.each(corpus.map((row) => [row.text, row] as const))(
  "%s",
  (_, { text, key, unknown }) => {
    const found = foodInLine(text)
    expect(found?.key).toBe(key)
    expect(found?.known).toBe(!unknown)
    // A key is its own key: what's kept matches again.
    expect(foodKey(key)).toBe(key)
  }
)

test(`at least ${COVERAGE * 100}% of the corpus is foods it knows`, () => {
  const known = corpus.filter((row) => !row.unknown).length
  expect(known / corpus.length).toBeGreaterThanOrEqual(COVERAGE)
})

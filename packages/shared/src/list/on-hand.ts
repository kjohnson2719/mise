import { foodParents, knownKey } from "../foods/vocabulary.ts"
import { foodKey } from "./food.ts"

// Always on hand: things lists made from the plan leave off. Each covers
// its kinds, so "salt" takes in kosher salt and sea salt too.

export const DEFAULT_ON_HAND = ["salt", "pepper", "water", "ice"]

/** Kinds that are the same thing to keep on hand, by food key. */
const KINDS: [string, RegExp][] = [
  [
    "salt",
    /^(?:(?:kosher|sea|table|fine|coarse|flaky|flake|iodized|plain)\s+)*salt$/,
  ],
  // Not bell, red, white or cayenne pepper: those are their own things.
  ["pepper", /^(?:(?:ground|cracked|black)\s+)*pepper$/],
  [
    "water",
    /^(?:(?:cold|warm|hot|boiling|lukewarm|ice|tap|filtered|room temperature)\s+)*water$/,
  ],
  ["ice", /^ice(?: cube)?$/],
]

const KIND_NAMES = new Set(KINDS.map(([kind]) => kind))

/**
 * An on-hand thing as matched: "Kosher salt" and "salt" are both "salt",
 * and so is Morton kosher salt, a kind of kosher salt.
 */
function onHandKey(name: string) {
  const key = foodKey(name)
  const known = knownKey(key)
  for (const each of [key, ...(known ? foodParents(known) : [])]) {
    const kind = KINDS.find(([, kinds]) => kinds.test(each))?.[0]
    if (kind) return kind
  }
  return key
}

/** What a name stands for: one thing, except "salt and pepper" is both. */
function onHandKeys(name: string): string[] {
  const parts = name
    .toLowerCase()
    .split(/\s*(?:,|&|\+|\band\b)\s*/)
    .filter(Boolean)
  if (parts.length > 1) {
    const keys = parts.map(onHandKey)
    if (keys.every((key) => KIND_NAMES.has(key))) return [...new Set(keys)]
  }
  return [onHandKey(name)]
}

/** Whether something's always on hand: "kosher salt" is, when salt is. */
export function onHandTest(onHand: readonly string[]) {
  const have = new Set(onHand.flatMap(onHandKeys))
  return (name: string) => onHandKeys(name).every((key) => have.has(key))
}

/**
 * The always-on-hand list without repeats, in order and lowercase: "black
 * pepper" and "salt and pepper" fold into "salt" and "pepper".
 */
export function tidyOnHand(names: readonly string[]) {
  const seen = new Set<string>()
  const tidy: string[] = []
  for (const name of names) {
    const text = name.trim().toLowerCase()
    if (!text) continue
    for (const key of onHandKeys(text)) {
      if (seen.has(key)) continue
      seen.add(key)
      tidy.push(KIND_NAMES.has(key) ? key : text)
    }
  }
  return tidy
}

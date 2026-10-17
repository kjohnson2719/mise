import type { AisleKey } from "../list/aisles.ts"
import { BRANDS_EN } from "./data/brands-en.ts"
import { NAMES_EN } from "./data/en.ts"
import { FOODS } from "./data/foods.ts"

// The foods Merran knows, by any of their names: finding the food in what
// a recipe line says ("King Arthur Unbleached All-Purpose Flour" is
// all-purpose flour), whatever else is around it. See docs/foods.md.

/** What's true of a food in every language. */
export type FoodFacts = {
  /** Where it's shelved. */
  aisle: AisleKey
  /** What it's a kind of: green bell pepper is a bell pepper. */
  parent?: string
  /** A size that makes it a different thing to buy: large eggs. */
  keepSize?: true
  /**
   * What a US cup of it weighs, in grams, so cups and grams add up: the
   * spoon-and-level weight bakers go by for dry goods (all-purpose flour is
   * 120 g, not USDA's 125), density for liquids.
   */
  gramsPerCup?: number
  /** What one weighs, in grams: "2 onions" against a price by the pound. */
  gramsEach?: number
  /** Its own units: a head of garlic is ten cloves, a stick of butter half a cup. */
  units?: Readonly<Record<string, FoodUnit>>
  /** How it keeps: out of the fridge, and for weeks (so no use-by guess). */
  keeps?: { out?: true; weeks?: true }
  /** What to search a store for, when what it's called isn't it. */
  search?: string
  /**
   * Its USDA FoodData Central food, generic and as bought (raw onions, not
   * fried), so nutrition doesn't search for it.
   */
  fdc?: number
}

/**
 * One of a food's own units, as another: a head of garlic is 10 cloves.
 * `back` goes back to it when an amount comes out whole: 20 cloves is 2
 * heads.
 */
export type FoodUnit = { quantity: number; unit: string; back?: true }

/** The names a food goes by in a language, besides its key. */
export type FoodNames = Readonly<Record<string, readonly string[]>>

/** A language's brands: words to drop, and brands that name a food. */
export type FoodBrands = {
  drop: readonly string[]
  means: Readonly<Record<string, string>>
}

/** A food found in some words. */
export type FoodFound = {
  /** Its key: "all-purpose flour"; "dried oregano" for a kind of oregano. */
  key: string
  /** What the list shows: the words that named it, as written. */
  name: string
}

/**
 * Words before a food that make it a different thing to buy, kept with
 * it: dried oregano isn't fresh, a red onion isn't a yellow one.
 */
const KINDS = new Set([
  "dried",
  "frozen",
  "smoked",
  "ground",
  "powdered",
  "pickled",
  "roasted",
  "sweet",
  "hot",
  "dark",
  "light",
  "vegan",
])

/** Colors, which make a different fruit or vegetable: a red grape. */
const COLORS = new Set([
  "red",
  "green",
  "yellow",
  "white",
  "black",
  "brown",
  "purple",
  "golden",
])

/**
 * Two words before a food that make it a different thing to buy, which
 * matters for allergies: dairy-free milk isn't milk.
 */
const FREE_OF = new Set(["dairy", "gluten", "sugar", "egg", "nut", "plant"])
const FREE = new Set(["free", "based"])

/**
 * Words after a food that make it something else: "salt and vinegar
 * seasoning", "cheese ravioli", "mustard powder", "corn syrup". The line is
 * then a food Merran doesn't know, rather than the wrong one.
 */
const MADE_INTO = new Set([
  "seasoning",
  "sauce",
  "mix",
  "paste",
  "dressing",
  "chip",
  "crisp",
  "soup",
  "spread",
  "dip",
  "ravioli",
  "tortellini",
  "dumpling",
  "pie",
  "cake",
  "cookie",
  "cracker",
  "glaze",
  "marinade",
  "rub",
  "gravy",
  "jelly",
  "curd",
  "syrup",
  "extract",
  "powder",
  "flavoring",
  "essence",
  "filling",
  "frosting",
  "icing",
  "candy",
  "pudding",
  "filled",
  "juice",
  "soda",
  "cereal",
  "flavored",
  "seed",
  "wafer",
  "wrapper",
  "stock",
  "broth",
])

/**
 * A word after a food that only says what it is: "sriracha sauce", "miso
 * paste", "taco seasoning mix".
 */
function saysAgain(key: string, word: string) {
  const aisle = FOODS[key]?.aisle
  if (key.endsWith(word)) return true
  if (word === "sauce" || word === "paste") {
    return aisle === "condiments" || aisle === "international"
  }
  return (word === "mix" || word === "blend") && aisle === "spices"
}

/**
 * Words after which the rest is about the food: "tuna in oil", "salt for
 * the pasta water".
 */
const ABOUT_IT = new Set(["with", "in", "from", "for"])

/** A food said in the plural that's another food. */
const PLURAL_IS: Record<string, string> = { "black pepper": "bell pepper" }

/** Sizes, kept for a food whose size is what's bought. */
const SIZES = new Set(["large", "medium", "small", "jumbo", "extra"])

/** "Tinned" is "canned", so both find the same food. */
const SAME_WORD: Record<string, string> = { tinned: "canned" }

/** Words whose "-ies" plural is "-ie" or "-i": cookies, chilies. */
const IES_TO = new Map([
  ...[
    "cookie",
    "brownie",
    "veggie",
    "pie",
    "smoothie",
    "hoagie",
    "calorie",
  ].map((word) => [word.slice(0, -2), word] as const),
  ...["chili", "chilli", "pierogi"].map(
    (word) => [word.slice(0, -1), word] as const
  ),
])

/** A word's singular, as English mostly makes it: "cherries" is "cherry". */
export function singular(word: string) {
  if (word === "leaves") return "leaf"
  if (/(ss|us)$/.test(word)) return word
  if (/ies$/.test(word)) {
    const stem = word.slice(0, -3)
    return IES_TO.get(stem) ?? `${stem}y`
  }
  if (/(oes|ches|shes|xes|sses)$/.test(word)) return word.replace(/es$/, "")
  if (/[^s]s$/.test(word)) return word.slice(0, -1)
  return word
}

/** A word as it's matched: lowercase, no accents, singular. */
function wordForm(word: string) {
  const plain = word.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  return singular(SAME_WORD[plain] ?? plain)
}

type Token = { form: string; start: number; end: number }

/**
 * Words and where they are: hyphens and slashes part them, apostrophes
 * don't, and "&" is "and".
 */
function tokens(text: string): Token[] {
  const found: Token[] = []
  for (const match of text.matchAll(/[\p{L}\p{N}'’]+|&/gu)) {
    const form =
      match[0] === "&" ? "and" : wordForm(match[0].replace(/['’]/g, ""))
    if (form) {
      found.push({
        form,
        start: match.index,
        end: match.index + match[0].length,
      })
    }
  }
  return found
}

const formOf = (text: string) => tokens(text).map((token) => token.form)

type Vocabulary = {
  /** Every name's words, joined, to its food's key. */
  names: Map<string, string>
  /** Brands that name a food, the same way. */
  means: Map<string, string>
  /** Brands to drop, as their words. */
  drop: string[][]
  /** The most words in a name. */
  longest: number
}

/**
 * A language's lookup: each food's names (in English its key is one too),
 * and its brands.
 */
function build(
  language: string,
  names: FoodNames,
  brands: FoodBrands
): Vocabulary {
  const index = new Map<string, string>()
  let longest = 1
  for (const key of Object.keys(FOODS)) {
    const aliases = names[key] ?? []
    for (const name of language === "en" ? [key, ...aliases] : aliases) {
      const words = formOf(name)
      index.set(words.join(" "), key)
      longest = Math.max(longest, words.length)
    }
  }
  const means = new Map<string, string>()
  for (const [brand, key] of Object.entries(brands.means)) {
    const words = formOf(brand)
    means.set(words.join(" "), key)
    longest = Math.max(longest, words.length)
  }
  return {
    names: index,
    means,
    drop: brands.drop.map((brand) => formOf(brand)),
    longest,
  }
}

/** Each language's names, and its lookup. */
const NAMES: Record<string, FoodNames> = { en: NAMES_EN }
const VOCABULARIES: Record<string, Vocabulary> = {
  en: build("en", NAMES_EN, BRANDS_EN),
}

/** What's true of a food, if Merran knows it. */
export function foodFacts(key: string): FoodFacts | undefined {
  return FOODS[key]
}

/** Every food Merran knows, by key. */
export function knownFoods(): string[] {
  return Object.keys(FOODS)
}

/**
 * The food Merran knows that a key is about: the key itself, or without
 * the kind before it ("gluten-free flour" is about flour, "dark brown
 * sugar" brown sugar). Undefined for a food it doesn't know.
 */
export function knownKey(key: string): string | undefined {
  for (let rest = key; ;) {
    if (FOODS[rest]) return rest
    const space = rest.indexOf(" ")
    if (space < 0) return undefined
    rest = rest.slice(space + 1)
  }
}

/** What a food is a kind of, and what that is, nearest first. */
export function foodParents(key: string): string[] {
  const parents: string[] = []
  for (let at = FOODS[key]?.parent; at && !parents.includes(at);) {
    parents.push(at)
    at = FOODS[at]?.parent
  }
  return parents
}

/**
 * A fact about a food that its kinds share, when the kind doesn't say:
 * a red onion weighs what an onion does, and keeps as one does. Only from
 * a parent in the same aisle, so lemon juice doesn't weigh a lemon.
 */
function shared<F extends "gramsEach" | "keeps">(
  key: string,
  fact: F
): FoodFacts[F] | undefined {
  let facts = FOODS[key]
  while (facts) {
    if (facts[fact] !== undefined) return facts[fact]
    const parent = facts.parent ? FOODS[facts.parent] : undefined
    if (parent?.aisle !== facts.aisle) return undefined
    facts = parent
  }
  return undefined
}

/** The food Merran knows in a name, as its key: "Kosher salt" is kosher salt. */
function foodOf(name: string) {
  const found = findFood(name)
  return found ? knownKey(found.key) : undefined
}

/** Grams per US cup of a food, by its key, or null: brown sugar, 213. */
export function gramsPerCup(key: string): number | null {
  const known = knownKey(key)
  return known ? (FOODS[known]?.gramsPerCup ?? null) : null
}

/** What one of a food weighs, in grams, by its key: an onion, 225. */
export function gramsEach(key: string): number | null {
  const known = knownKey(key)
  return known ? (shared(known, "gramsEach") ?? null) : null
}

/** A food's own units, by its key: garlic's heads and cloves. */
export function foodUnits(
  key: string | undefined
): Readonly<Record<string, FoodUnit>> {
  const known = key ? knownKey(key) : undefined
  return known ? (FOODS[known]?.units ?? {}) : {}
}

/** How a food named keeps: out of the fridge, for weeks. */
export function howItKeeps(name: string): { out?: true; weeks?: true } {
  const key = foodOf(name)
  return key ? (shared(key, "keeps") ?? {}) : {}
}

/**
 * What to search a store for, for a name: the food's own search words
 * when what it's called isn't what the store calls it ("thickened cream"
 * is heavy cream), else the name, with the words a store won't know
 * swapped ("tinned" is "canned").
 */
export function searchWords(name: string): string {
  const key = foodOf(name)
  const search = key ? FOODS[key]?.search : undefined
  if (search) return search
  return name.replace(/[\p{L}]+/gu, (word) => {
    const same = SAME_WORD[word.toLowerCase()]
    return same ?? word
  })
}

/** A food's name in a language: its key in English, else its first name. */
export function foodName(key: string, language = "en") {
  if (language === "en") return key
  return NAMES[language]?.[key]?.[0] ?? key
}

/**
 * The food some words are about, if Merran knows it: the first place in
 * them where a known name starts, the longest name there. Brands are
 * dropped first ("King Arthur"), or name the food themselves ("Diamond
 * Crystal" is kosher salt). A word before it that makes it a kind ("dried
 * oregano") stays with it, as does a size for a food sold by size ("large
 * eggs"). Null when no known food is in them.
 */
export function findFood(text: string, language = "en"): FoodFound | null {
  const vocabulary = VOCABULARIES[language] ?? VOCABULARIES.en!
  const all = tokens(text)
  // Brands' words are skipped, and noted where they name a food.
  const kept: Token[] = []
  for (let at = 0; at < all.length; at++) {
    const brand = vocabulary.drop.find((words) =>
      words.every((word, i) => all[at + i]?.form === word)
    )
    if (brand) {
      at += brand.length - 1
      continue
    }
    kept.push(all[at]!)
  }
  for (let at = 0; at < all.length; at++) {
    for (let size = vocabulary.longest; size >= 1; size--) {
      const words = all.slice(at, at + size)
      if (words.length < size) continue
      const key = vocabulary.means.get(words.map((word) => word.form).join(" "))
      if (key) return { key, name: foodName(key, language) }
    }
  }

  // The name that ends last, and of those the longest: English puts the
  // food last, so "vanilla ice cream" is ice cream, "chicken sausage"
  // sausage, "whole-milk ricotta" ricotta, and "cream cheese" cream cheese.
  const names: { at: number; size: number; key: string }[] = []
  for (let at = 0; at < kept.length; at++) {
    const most = Math.min(vocabulary.longest, kept.length - at)
    for (let size = most; size >= 1; size--) {
      const words = kept.slice(at, at + size)
      const key = vocabulary.names.get(words.map((word) => word.form).join(" "))
      if (!key) continue
      names.push({ at, size, key })
      break
    }
  }
  // What comes after "with", "in" or "from", once a food is named, is about
  // it: "diced tomatoes with green chiles", "tuna in oil", "lemon juice
  // from 1 lemon". A name that runs past the word ("chipotle in adobo")
  // still counts.
  const cut = kept.findIndex(
    (word, at) =>
      ABOUT_IT.has(word.form) && names.some((name) => name.at + name.size <= at)
  )
  let best: { at: number; size: number; key: string } | null = null
  for (const name of names) {
    if (cut >= 0 && name.at > cut) continue
    const end = name.at + name.size
    const bestEnd = best ? best.at + best.size : -1
    if (end > bestEnd || (end === bestEnd && name.size > best!.size)) {
      best = name
    }
  }
  if (!best) return null
  // "Provolone cheese", "kielbasa sausage": a kind, said with what it's a
  // kind of, is the kind.
  const kindOf = names.find(
    (name) =>
      name.at + name.size === best!.at && FOODS[name.key]?.parent === best!.key
  )
  if (kindOf) best = { ...kindOf, size: kindOf.size + best.size }
  // "Peppers" are bell peppers: black pepper is never more than one.
  const word = kept[best.at]!
  const said = text.slice(word.start, word.end).toLowerCase()
  if (best.size === 1 && said !== word.form && PLURAL_IS[best.key]) {
    best = { ...best, key: PLURAL_IS[best.key]! }
  }
  const next = kept[best.at + best.size]
  if (next && MADE_INTO.has(next.form) && !saysAgain(best.key, next.form)) {
    return null
  }
  const last = kept[best.at + best.size - 1]!
  let first = best.at
  let kind = ""
  const before = kept[best.at - 1]
  const twoBefore = kept[best.at - 2]
  const produce = FOODS[best.key]?.aisle === "produce"
  if (
    before &&
    twoBefore &&
    FREE.has(before.form) &&
    FREE_OF.has(twoBefore.form)
  ) {
    // "Dairy-free milk", "gluten-free flour": kept, hyphenated.
    kind = `${twoBefore.form}-${before.form} `
    first = best.at - 2
  } else if (
    before &&
    (KINDS.has(before.form) || (produce && COLORS.has(before.form))) &&
    // Not twice: "yellow summer squash" is yellow squash.
    !best.key.startsWith(`${before.form} `) &&
    // A spice is the same ground: ground cayenne is cayenne.
    !(before.form === "ground" && FOODS[best.key]?.aisle === "spices")
  ) {
    kind = `${before.form} `
    first = best.at - 1
  } else if (before && SIZES.has(before.form) && FOODS[best.key]?.keepSize) {
    first = best.at - 1
  }
  return {
    key: `${kind}${best.key}`,
    name: text.slice(kept[first]!.start, last.end),
  }
}

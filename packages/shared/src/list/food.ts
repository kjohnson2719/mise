import { findFood, singular } from "../foods/vocabulary.ts"
import { bareFood, parseIngredient } from "../ingredients/parse.ts"
import { aisleByWords } from "./aisles.ts"

// The thing to buy in an ingredient line, named so the same food matches
// across recipes, the list and the pantry: "2 Large Onions" and "1 onion"
// are both "onion", "chopped parsley" is parsley, plain flour is
// all-purpose flour.

/**
 * Bumped whenever keys are made differently, so the ones the server keeps
 * (on lists, in the pantry, for aisles and store products) are made again.
 */
export const FOOD_KEYS_VERSION = 10

/** Words that describe a size or freshness, not a different thing to buy. */
const DESCRIPTORS =
  /\b(extra[- ]large|large|medium|small|jumbo|fresh|freshly|ripe|organic|boneless|skinless)\b/g

/**
 * A name's plain form: lowercase, without brackets, sizes or freshness,
 * the last word singular. "2 Large Onions" without its number is "onion".
 */
export function plainKey(food: string) {
  const words = food
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(DESCRIPTORS, " ")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return food.toLowerCase().trim()
  words[words.length - 1] = singular(words[words.length - 1]!)
  return words.join(" ")
}

/**
 * A food's key, the same for every way of saying it: the key of the food
 * Merran knows in it, else its shopping name's plain form. "Chopped fresh
 * flat-leaf parsley" and "parsley" are "parsley"; "plain flour" is
 * "all-purpose flour".
 */
export function foodKey(food: string) {
  return named(food).key
}

/**
 * How-much phrases that aren't part of the thing to buy: "Salt to taste",
 * "lemon wedges to serve", "oil, plus a little extra".
 */
export const HOW_MUCH =
  /\s+(to taste|as needed|if needed|as required|to serve|to garnish|to finish|for (serving|garnish|garnishing|decoration|decorating|drizzling|frying|dusting|brushing|greasing|the pan|the tin|the top|topping)|optional|plus (a little |a bit |some )?(extra|more)|or more|or to taste|if (you )?like|if desired|if using)\b.*$/i

/** Ways of preparing it, which don't change what's bought: "chopped". */
const PREP =
  /^(?:(?:finely|roughly|coarsely|thinly|freshly|lightly|very)\s+)?(?:chopped|minced|diced|sliced|peeled|cubed|halved|quartered|softened|melted|beaten|sifted|packed|squeezed|zested|juiced|trimmed|rinsed|drained|torn|crumbled|grated|shredded|crushed|deseeded|seeded|cored)\s+/i

/** A size, which for fruit and vegetables doesn't change what's bought. */
const SIZE = /^(?:extra[- ]large|large|medium|small|jumbo|big)\s+/i

/** Prepared foods that are a product of their own. */
const PRODUCT = /^crushed red pepper/i

/** Prep said after the food, without a comma: "carrots peeled and chopped". */
const PREP_AFTER =
  /(?:\s+(?:and|or)?\s*(?:(?:finely|roughly|coarsely|thinly)\s+)?(?:chopped|minced|diced|sliced|peeled|cubed|halved|quartered|trimmed|deseeded|seeded|cored|grated|shredded|crushed))+$/i

/**
 * Prep and size words come off fruit, vegetables, herbs and meat (chopped
 * parsley is parsley, large onions are onions, diced chicken is chicken),
 * not off what's sold that way: diced tomatoes come in cans, grated
 * parmesan in a tub, and large eggs are a size of egg.
 */
function withoutPrep(name: string) {
  let rest = name
  for (;;) {
    if (PRODUCT.test(rest)) return rest
    const after = rest.match(PREP_AFTER)
    const food = after && after.index! > 0 ? rest.slice(0, after.index) : rest
    const aisle = aisleByWords(food)
    if (aisle !== "produce" && aisle !== "meat-seafood") return rest
    if (food !== rest) {
      rest = food
      continue
    }
    const prep = rest.match(PREP)
    // Minced meat is a cut of its own: minced beef is ground beef.
    if (prep && aisle === "meat-seafood" && /minced/i.test(prep[0])) return rest
    const size = aisle === "produce" ? rest.match(SIZE) : null
    const off = prep ?? size
    if (!off || rest.length <= off[0].length) return rest
    rest = rest.slice(off[0].length)
  }
}

/** Words that say which of a food, so a choice can share the food. */
const WHICH =
  /^(?:yellow|white|red|green|brown|black|golden|purple|orange|sweet|hot|mild|dry|fresh|frozen|dried|light|dark|large|medium|small|unsalted|salted|whole|smoked|plain)$/i

/**
 * The first of two choices, said with "or" or a slash: "butter or
 * margarine" is butter, "sunflower or vegetable oil" sunflower oil, "medium
 * yellow or white onion" medium yellow onion, "chicken stock/broth" chicken
 * stock, "Chardonnay or other dry white wine" Chardonnay. When the second
 * comes with its own amount ("½ tsp Diamond Crystal or ¼ tsp Morton kosher
 * salt"), it's the one that names the food.
 */
function firstChoice(name: string) {
  const said = name
    .replace(/\s+and\/or\s+/gi, " or ")
    .replace(/\s+\/\s+/g, " or ")
    .replace(/(\p{L})\/(\p{L})/gu, "$1 or $2")
  const choices = said.match(/^(.+?)\s+or\s+(.+)$/i)
  if (!choices) return name
  const first = choices[1]!.trim()
  // Of three or more choices, the second is up to the next "or".
  const second = choices[2]!.split(/\s+or\s+/i)[0]!.trim()
  // "Melted butter or ¼ cup vegetable oil" is butter; "½ tsp Diamond
  // Crystal or ¼ tsp Morton kosher salt", with no food first, the second.
  if (/^\d/.test(second)) {
    return findFood(first) ? first : (parseIngredient(second).food ?? first)
  }
  const a = first.split(/\s+/)
  const b = second.split(/\s+/)
  // "Canola or other neutral oil", "cannellini or great Northern beans":
  // the first with the second's last word, when only that's a food.
  const ownNoun = `${first} ${b.at(-1)}`
  const withOwnNoun = () =>
    b.length > 1 && !findFood(first) && findFood(ownNoun) ? ownNoun : first
  if (/^(?:other|another|any|similar)\b/i.test(second)) return withOwnNoun()
  // "Thickened cream / heavy cream": two whole names, the first meant.
  if (b.length < 2 || a.at(-1)!.toLowerCase() === b.at(-1)!.toLowerCase()) {
    return first
  }
  const together = `${first} ${b.slice(1).join(" ")}`
  // "Sunflower or vegetable oil", "low-sodium chicken or vegetable broth":
  // the choice is which oil, which broth, when that's a food Merran knows
  // and the first choice's word is part of it. "Mayonnaise or plain Greek
  // yogurt" isn't mayonnaise yogurt.
  const known = findFood(together)
  if (known) {
    const word = a.at(-1)!.toLowerCase()
    const shares =
      known.name
        .toLowerCase()
        .split(/[\s-]+/)
        .includes(word) ||
      // "Fresh or frozen blueberries": the first isn't a food, only which.
      !findFood(first)
    return shares ? together : first
  }
  if (withOwnNoun() !== first) return ownNoun
  // A food it doesn't know: share it when the first only says which, and
  // isn't a food itself ("honey or golden syrup" is honey).
  const shared =
    !findFood(first) &&
    (a.length === 1 || WHICH.test(a.at(-1)!)) &&
    a.at(-1)!.toLowerCase() !== b.at(-1)!.toLowerCase()
  return shared ? together : first
}

/** A label before the food: "Egg wash:", "Optional toppings:". */
const LABEL = /^[\p{L}\s-]{2,30}:\s+(?=\S)/u

/**
 * What's done to it said after it, which can name other foods: "onion cut
 * the same size as the potatoes", "egg beaten with 1 tbsp milk".
 */
const DONE_AFTER =
  /\s+(?:cut|sliced|chopped|diced)\s+(?:into|in|the|to|across|against|lengthwise)\b.*$|\s+(?:beaten|mixed|whisked|tossed|combined|blended)\s+with\b.*$/i

/** What it comes in, said before the food: "can chickpeas", "tube of". */
const CONTAINER =
  /^(?:\d+\s*x\s*)?(?:tubes?|cans?|tins?|jars?|packets?|packs?|packages?|pkgs?\.?|bags?|boxes|box|bottles?|cartons?|containers?|envelopes?|sleeves?|blocks?|tubs?|pouch(?:es)?)(?:\s+cans?)?(?:\s+of)?\s+/i

/** Zest or juice of a fruit is the fruit: "zest of half of a lemon". */
const ZEST_OF =
  /^(?:the\s+)?(?:zest|juice|rind|zest and juice|juice and zest)\s+of\s+(?:(?:half|½)\s+(?:of\s+)?)?(?:an?|one|the|\d+(?:\/\d+)?)?\s*(.+)$/i

/** What's in brackets, closed or not: "garlic cloves (" is garlic cloves. */
function noBrackets(name: string) {
  let rest = name
  for (let before = ""; before !== rest;) {
    before = rest
    rest = rest.replace(/\([^()]*\)/g, " ")
  }
  return rest.replace(/\(.*$/, " ").replace(/\)/g, " ")
}

/**
 * The thing to buy as the list names it: without what's in brackets, a
 * measure ("Pinch of"), how it's used ("to serve"), what it comes in ("can
 * chickpeas"), a second choice, or prep and sizes that don't change what's
 * bought. "Large onions, chopped" is "onions"; "lemon wedges to serve" is
 * "lemon wedges"; "zest of half of a lemon" is "lemon".
 */
export function shoppingName(food: string) {
  return named(food).name
}

/**
 * A food's name and key: a food Merran knows by the words that named it
 * and its own key ("King Arthur Unbleached All-Purpose Flour" is
 * "All-Purpose Flour", all-purpose flour); else the tidied words and their
 * plain form.
 */
function named(food: string): { name: string; key: string; known: boolean } {
  let name = noBrackets(food).replace(/\*+/g, "").replace(/\s+/g, " ").trim()
  name = name.replace(LABEL, "").replace(DONE_AFTER, "")
  name = bareFood(name.replace(HOW_MUCH, "").trim())
  name = name.replace(ZEST_OF, "$1")
  const container = name.match(CONTAINER)
  if (container && name.length > container[0].length) {
    name = name.slice(container[0].length)
  }
  // "Large eggs and 2 large yolks": the first, which says what it is.
  name = name.replace(/\s+(?:and|plus)\s+\d.*$/i, "")
  name = firstChoice(name)
  const known = findFood(name)
  if (known) return { ...known, known: true }
  const shown = withoutPrep(name).replace(/\s+/g, " ").trim() || food
  return { name: shown, key: plainKey(shown), known: false }
}

/**
 * The thing to buy in an ingredient line, as the list has it: its name
 * ("chicken thighs") and key ("chicken thigh"), or null when there's none.
 */
export function lineFood(line: string) {
  const found = foodInLine(line)
  return found && { name: found.name, key: found.key }
}

/**
 * The food in an ingredient line, and whether it's one Merran knows: for
 * seeing how much of a library the food vocabulary covers.
 */
export function foodInLine(line: string) {
  const parsed = parseIngredient(line)
  const found = named(parsed.food ?? parsed.text)
  return found.name ? found : null
}

/** A food in an ingredient line, with how much of it. */
export type LineFood = {
  name: string
  key: string
  known: boolean
  quantity: number | null
  quantityMax: number | null
  unitId: string | null
}

/** A word before the first food that the next one shares: "dried". */
const SHARED_KIND = /^(?:dried|frozen|ground|smoked)\s+/i

/**
 * Every food an ingredient line names, each with its amount: "Salt and
 * pepper" is salt and pepper; "½ tsp each dried thyme and oregano" is ½ tsp
 * of dried thyme and ½ tsp of dried oregano; "2 tbsp olive oil and 1 tbsp
 * butter" each its own. Without "each", the amount is the first food's. A
 * line is only parted when each part is a food Merran knows, so "black
 * and white sesame seeds" and "half and half" stay one food; and commas
 * part foods only after "each" (otherwise what follows a comma is a
 * note). Most lines are one food.
 */
export function lineFoods(line: string): LineFood[] {
  const parsed = parseIngredient(line)
  const whole = named(parsed.food ?? parsed.text)
  if (!whole.name) return []
  return (
    partedFoods(parsed) ?? [
      {
        ...whole,
        quantity: parsed.quantity,
        quantityMax: parsed.quantityMax,
        unitId: parsed.unitId,
      },
    ]
  )
}

/** The foods a line names when it names more than one, else null. */
function partedFoods(
  parsed: ReturnType<typeof parseIngredient>
): LineFood[] | null {
  let text = noBrackets(parsed.parts ? parsed.parts.rest : parsed.text)
    .replace(/^\s*of\s+/i, "")
    .replace(/\*+/g, "")
  const each = /\beach\b/i.test(text)
  text = text.replace(/\beach\b/gi, " ")
  if (!each) text = text.split(",")[0]!
  const pieces = text
    .split(/\s*,\s*(?:and\s+|&\s+)?|\s+(?:and|&)\s+/i)
    .map((piece) => piece.trim())
    .filter(Boolean)
  if (pieces.length < 2) return null
  // A food with "and" in its name is one: half-and-half.
  if (/\b(?:and)\b|&/i.test(findFood(text)?.name ?? "")) return null

  const foods: LineFood[] = []
  let kind = ""
  for (const [i, piece] of pieces.entries()) {
    // "2 large eggs and 2 yolks": a part with its own amount.
    const own = /^\d/.test(piece) ? parseIngredient(piece) : null
    let words = own ? (own.food ?? own.text) : piece
    const lead = words.match(SHARED_KIND)?.[0]
    if (i === 0) kind = lead ?? ""
    else if (kind && !lead) words = kind + words
    const found = named(words)
    if (!found.known) return null
    // The food ends the part: "vinegar seasoning" isn't vinegar, so "salt
    // and vinegar seasoning" is one thing.
    const said = noBrackets(words).replace(HOW_MUCH, "").trim().toLowerCase()
    if (!said.endsWith(found.name.toLowerCase())) return null
    const amount = own ?? (each || i === 0 ? parsed : null)
    foods.push({
      ...found,
      quantity: amount?.quantity ?? null,
      quantityMax: amount?.quantityMax ?? null,
      unitId: amount?.unitId ?? null,
    })
  }
  return foods
}

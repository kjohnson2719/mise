import { findFood } from "../foods/vocabulary.ts"
import { UNITS, type Unit } from "../units/units.ts"

const UNICODE_FRACTIONS: Record<string, string> = {
  "½": "1/2",
  "⅓": "1/3",
  "⅔": "2/3",
  "¼": "1/4",
  "¾": "3/4",
  "⅕": "1/5",
  "⅖": "2/5",
  "⅗": "3/5",
  "⅘": "4/5",
  "⅙": "1/6",
  "⅚": "5/6",
  "⅛": "1/8",
  "⅜": "3/8",
  "⅝": "5/8",
  "⅞": "7/8",
}

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  dozen: 12,
  half: 0.5,
}

/** Words after "a" or "an" that make the amount vague, not one: "a few sprigs". */
const VAGUE_AFTER_A = new Set([
  "few",
  "couple",
  "little",
  "bit",
  "splash",
  "drizzle",
])

const NUMBER = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?)`
const QUANTITY = new RegExp(
  `^(${NUMBER})(?:\\s*(?:-|–|—|to|or)\\s*(${NUMBER}))?`,
  "i"
)

// Single letters are case-sensitive: "t" is a teaspoon, "T" a tablespoon.
const CASE_SENSITIVE = new Map<string, Unit>()
const UNIT_LOOKUP = new Map<string, Unit>()
for (const unit of UNITS) {
  for (const key of [
    unit.name,
    unit.pluralName,
    unit.abbreviation,
    ...unit.aliases,
  ]) {
    if (!key) continue
    if (key.replace(/\./g, "").length === 1) CASE_SENSITIVE.set(key, unit)
    else UNIT_LOOKUP.set(key.toLowerCase().replace(/\.$/, ""), unit)
  }
}

function findUnit(token: string): Unit | undefined {
  const bare = token.replace(/\.$/, "")
  if (bare.length === 1) return CASE_SENSITIVE.get(bare)
  return UNIT_LOOKUP.get(bare.toLowerCase())
}

/** "1 1/2" → 1.5, "3/4" → 0.75, "1,5" → 1.5. */
export function parseNumber(text: string): number {
  const value = text.trim()
  const mixed = value.match(/^(\d+)\s+(\d+)\/(\d+)$/)
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3])
  const fraction = value.match(/^(\d+)\/(\d+)$/)
  if (fraction) return Number(fraction[1]) / Number(fraction[2])
  return Number(value.replace(",", "."))
}

/** Measures that come without a number, besides units: "a drizzle of". */
const MEASURE_WORDS = new Set([
  "splash",
  "splashes",
  "drizzle",
  "sprinkle",
  "sprinkling",
  "squeeze",
  "squirt",
  "squirts",
  "shake",
  "shakes",
  "knob",
  "touch",
  "dollop",
  "glug",
  "glugs",
  "bit",
  "drop",
  "drops",
  "lot",
])

/** Measures that need no "of" after them: "handful coriander". */
const MEASURES_ALONE = new Set([
  "handful",
  "pinch",
  "dash",
  "dashes",
  "splash",
  "splashes",
  "shake",
  "shakes",
  "drizzle",
  "sprinkle",
  "knob",
  "squeeze",
  "clove",
  "cloves",
])

/**
 * The food without a measure that has no number, or a bracket before it:
 * "Pinch of salt" is salt, "a few sprigs of thyme" thyme, "a little olive
 * oil" olive oil, "(75 g) butter" butter. What came off goes in `asides`.
 */
export function bareFood(text: string, asides: string[] = []): string {
  let rest = text.trim()
  const bracket = rest.match(/^\(([^)]+)\)\s*/)
  if (bracket && rest.length > bracket[0].length) {
    asides.push(bracket[1]!.trim())
    rest = rest.slice(bracket[0].length)
  }
  const words = rest.split(/\s+/)
  let at = 0
  const is = (pattern: RegExp) => pattern.test(words[at] ?? "")
  const article = is(/^(?:a|an|some)$/i)
  if (article) at++
  if (is(/^(?:good|generous|big|large|small|heaping|scant)$/i)) at++
  // "a few sprigs thyme" needs no "of" after the measure.
  const few = is(/^(?:few|couple)$/i)
  if (few) {
    at++
    if (is(/^of$/i)) at++
  }
  const measure = words[at] ?? ""
  // Nor does "a little olive oil".
  const little = article && /^little$/i.test(measure)
  const measured =
    little || findUnit(measure) || MEASURE_WORDS.has(measure.toLowerCase())
  if (!measured) {
    // "a few basil leaves": a few of the food itself.
    if (!few || at >= words.length) return rest
    asides.push(words.slice(0, at).join(" "))
    return words.slice(at).join(" ")
  }
  at++
  const of = is(/^of$/i)
  if (of) at++
  const alone = MEASURES_ALONE.has(measure.toLowerCase())
  if ((!of && !few && !little && !alone) || at >= words.length) return rest
  asides.push(words.slice(0, of ? at - 1 : at).join(" "))
  return words.slice(at).join(" ")
}

/** "minus 2 tablespoons " before the food: an amount taken off. */
const MINUS = new RegExp(
  String.raw`^((?:minus|less)\s+${NUMBER}\s*([A-Za-z.]+))\s+`,
  "i"
)

/** "/ 240 ml " before the food: the amount another way. */
const OTHER_AMOUNT = new RegExp(String.raw`^\/\s*(${NUMBER}\s*([A-Za-z.]+))\s+`)

/**
 * The food after its amount without another way of measuring it: "(75 g)"
 * in "½ cup (75 g) butter", "plus 2 tbsp" in "1 cup plus 2 tbsp flour",
 * "/ 240 ml" in "1 cup / 240 ml milk". What came off goes in `asides`.
 */
function withoutOtherAmount(body: string, asides: string[]): string {
  let rest = body
  const plus = plusAmount(rest)
  if (plus) {
    asides.push(rest.slice(0, plus.length).trim())
    rest = rest.slice(plus.length).trim()
  }
  // "2 cups minus 2 tablespoons cake flour": noted, not the food.
  const minus = rest.match(MINUS)
  if (minus && findUnit(minus[2]!)) {
    asides.push(minus[1]!.trim())
    rest = rest.slice(minus[0].length)
  }
  const bracket = rest.match(/^\(([^)]+)\)\s*/)
  if (bracket) {
    asides.push(bracket[1]!.trim())
    rest = rest.slice(bracket[0].length)
  }
  const slash = rest.match(OTHER_AMOUNT)
  if (slash && findUnit(slash[2]!)) {
    asides.push(slash[1]!)
    rest = rest.slice(slash[0].length)
  }
  rest = rest.replace(/^of\s+/i, "").trim()
  return rest || body
}

/**
 * The size of what it comes in, without brackets: "10.5 oz." in "1 10.5
 * oz. can soup", "15-oz" in "1 15-oz bag frozen peas".
 */
const PACK_SIZE =
  /^\s+(\d+(?:\.\d+)?\s*-?\s*(?:oz|ounces?|fl\.?\s*oz|g|grams?|lbs?|pounds?|ml|l|liters?|litres?)\.?)(?=\s+(?:cans?|jars?|bags?|box(?:es)?|packages?|packets?|pkgs?\.?|blocks?|containers?|cartons?|envelopes?|sleeves?|bottles?|tubs?|tubes?|pouch(?:es)?|loa(?:f|ves)|bars?|logs?)\b)/i

/** A size before a unit: "2 large cloves garlic", "1 heaped tbsp flour". */
const UNIT_SIZE =
  /^(?:large|small|medium|big|heaped|heaping|level|scant|generous|good|packed|rounded)$/i

/**
 * A size joined to its unit by a hyphen, before the food: "3-pound" in "1
 * 3-pound turkey breast", "7-inch" in "5 7-inch flour tortillas".
 */
const HYPHEN_SIZE =
  /^\s+(\d+(?:\.\d+)?\s*[-–]\s*(?:ounce|oz|pound|lb|inch|in|cm|centimeter|centimetre|gram|g|kg)\.?)(?=\s)/i

/**
 * Text with what's in brackets taken out, nested or left open: "green
 * onions (, finely sliced)" is "green onions", noted "finely sliced".
 */
function outOfBrackets(text: string) {
  const notes: string[] = []
  let kept = ""
  let inside = ""
  let depth = 0
  const note = () => {
    const tidy = inside
      .replace(/[()]/g, " ")
      .replace(/^[\s,;:-]+|[\s,;:-]+$/g, "")
      .replace(/\s+/g, " ")
    if (tidy) notes.push(tidy)
    inside = ""
  }
  for (const char of text) {
    if (char === "(") {
      if (depth > 0) inside += char
      depth++
    } else if (char === ")" && depth > 0) {
      depth--
      if (depth > 0) inside += char
      else note()
    } else if (depth > 0) inside += char
    else kept += char
  }
  if (depth > 0) note()
  return { text: kept.replace(/\s+/g, " ").trim(), notes }
}

/** Only words that describe the food, before a comma that's between them. */
const DESCRIBING =
  /^(?:(?:boneless|skinless|bone-in|skin-on|fresh|large|medium|small|extra[- ]large|jumbo|ripe|firm|peeled|raw|cooked|uncooked|unsalted|salted|organic|whole|frozen|thawed|softened|lean|extra[- ]lean|thick[- ]cut|thin[- ]cut|seedless|pitted|dried|toasted|plain|low[- ]sodium|unsweetened|sweetened)(?:\s+|$|\s*and\s+))+$/i

/** What starts a note after a comma, rather than more of the food. */
const NOTE_START =
  /^(?:for|to|such|plus|about|from|with|if|see|divided|optional|at|in|into|cut|as|preferably|ideally|room|or\s+(?:more|less|to|as))\b/i

/**
 * Words set apart by commas before the food they describe, joined: "creamy,
 * emulsified peanut butter", "stemmed, cleaned, and chopped collard
 * greens"; and choices, the first with the food: "red, green, or yellow
 * bell pepper" is "red or yellow bell pepper". Only when the words before
 * name no food and are few, and a food Merran knows ends the part they
 * lead to. Else the body as it was.
 */
function describedFood(body: string): string {
  const parts = body.split(",")
  if (parts.length < 2 || findFood(parts[0]!)) return body
  for (let at = 1; at < Math.min(parts.length, 5); at++) {
    const before = parts[at - 1]!.trim()
    if (!before || /\d/.test(before) || before.split(/\s+/).length > 3) {
      return body
    }
    const part = parts[at]!.trim()
    if (!part || NOTE_START.test(part)) return body
    const found = findFood(part)
    if (!found) continue
    if (!part.toLowerCase().endsWith(found.name.toLowerCase())) return body
    const choice = part.match(/^(?:and\/)?or\s+(.+)$/i)
    const food = choice
      ? `${parts[0]!.trim()} or ${choice[1]}`
      : [...parts.slice(0, at), part.replace(/^and\s+/i, "")]
          .map((words) => words.trim())
          .join(" ")
    return [food, ...parts.slice(at + 1)].join(",")
  }
  return body
}

/** Tidies an ingredient line: bullets gone, unicode fractions spelled out, spaces collapsed. */
export function normalizeIngredientLine(line: string) {
  return (
    line
      .replace(/^\s*(?:[-–•*·▢□☐]|\d+[.)](?=\s))\s*/, "")
      .replace(/(\d)?([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/g, (_, whole: string, frac: string) =>
        whole ? `${whole} ${UNICODE_FRACTIONS[frac]}` : UNICODE_FRACTIONS[frac]!
      )
      .replace(/(\d)\s*⁄\s*(\d)/g, "$1/$2")
      // "1 and 1/2 cups" is 1 1/2 cups.
      .replace(/\b(\d+)\s+and\s+(\d+\/\d+)/g, "$1 $2")
      // So is "1-1/2 cups": a whole number and a fraction, not 1 to 1/2.
      .replace(
        /\b(\d+)-(\d+)\/(\d+)\b/g,
        (both: string, whole: string, top: string, bottom: string) =>
          Number(top) < Number(bottom) ? `${whole} ${top}/${bottom}` : both
      )
      .replace(/\s+/g, " ")
      .trim()
  )
}

/** Words before an amount that only say it's rough: "about 3", "heaping ½". */
const ROUGHLY =
  /^(?:about|approx\.?|approximately|roughly|around|~|heaping|heaped|scant|shy|level|generous|a\s+(?:heaping|heaped|scant|shy|generous|good))\s+(?=\d)/i

export type ParsedIngredient = {
  /** The tidied line, exactly what's shown when nothing is scaled. */
  text: string
  quantity: number | null
  /** The top of a range: 3 in "2 to 3 cloves". */
  quantityMax: number | null
  unitId: string | null
  food: string | null
  note: string | null
  /**
   * The line split around its amount, to show it with another amount:
   * `quantity + between + unit + rest` is the line as written.
   */
  parts: {
    quantity: string
    between: string
    unit: string
    rest: string
  } | null
}

/**
 * Reads an ingredient line as people write it: "2-3 cloves garlic, minced"
 * is 2 to 3 cloves of garlic, minced. What can't be read is left as text.
 */
export function parseIngredient(line: string): ParsedIngredient {
  const text = normalizeIngredientLine(line)
  let quantity: number | null = null
  let quantityMax: number | null = null
  let quantityText = ""

  // "Heaping ½ tsp": the amount, said as it's written when it isn't scaled.
  const rough = text.match(ROUGHLY)?.[0] ?? ""
  const numeric = text.slice(rough.length).match(QUANTITY)
  if (numeric) {
    quantity = parseNumber(numeric[1]!)
    quantityMax = numeric[2] ? parseNumber(numeric[2]) : null
    quantityText = rough + numeric[0]
  } else {
    const word = text.match(/^([a-z]+)\b/i)
    const value = word ? NUMBER_WORDS[word[1]!.toLowerCase()] : undefined
    const next = text
      .slice(word?.[0].length ?? 0)
      .trim()
      .split(/\s+/)[0]
      ?.toLowerCase()
    const vague = value === 1 && next !== undefined && VAGUE_AFTER_A.has(next)
    if (word && value !== undefined && !vague) {
      quantity = value
      quantityText = word[0]
    }
  }

  let cursor = quantityText.length
  let between = ""
  let sizeNote: string | null = null
  let unit: Unit | undefined
  let unitText = ""

  if (quantity !== null) {
    // "1 (14.5 oz) can tomatoes": the size in brackets belongs in the note,
    // as does one without them, "1 10.5 oz. can soup".
    const size =
      text.slice(cursor).match(/^\s*\(([^)]+)\)/) ??
      text.slice(cursor).match(PACK_SIZE) ??
      text.slice(cursor).match(HYPHEN_SIZE)
    if (size) {
      sizeNote = size[1]!.trim()
      between = size[0]
      cursor += size[0].length
    }

    const words = text
      .slice(cursor)
      .match(/^(\s*)([A-Za-z.]+)(?:(\s+)([A-Za-z.]+))?/)
    if (words) {
      const two = words[4] ? findUnit(`${words[2]} ${words[4]}`) : undefined
      // "2 large cloves garlic": a size, then the unit.
      const sized =
        words[4] && UNIT_SIZE.test(words[2]!) ? findUnit(words[4]) : undefined
      if (two) {
        unit = two
        unitText = `${words[1]}${words[2]}${words[3]}${words[4]}`
      } else if (sized) {
        unit = sized
        unitText = `${words[1]}${words[2]}${words[3]}${words[4]}`
        sizeNote = [sizeNote, words[2]!.toLowerCase()]
          .filter(Boolean)
          .join(", ")
      } else {
        unit = findUnit(words[2]!)
        if (unit) unitText = `${words[1]}${words[2]}`
      }
      cursor += unitText.length
    }
  }

  const afterUnit = text.slice(cursor)
  let body = (unit ? afterUnit.replace(/^\s+of\b/i, "") : afterUnit).trim()
  // What's in brackets is about the food, never the food: "(, drained)",
  // "((Note 4))", "(or Taiwanese rice wine (mijiu) if you can find it".
  const bracketed = outOfBrackets(body)
  body = bracketed.text.replace(/\*+/g, "")
  const asides: string[] = []
  if (unit) body = withoutOtherAmount(body, asides)
  else if (quantity === null) body = bareFood(body, asides)
  asides.push(...bracketed.notes)
  let note: string | null = null
  // A comma between describing words is part of the food: "skinless,
  // boneless chicken thighs, cut up" is skinless boneless chicken thighs.
  body = describedFood(body)
  let comma = body.indexOf(",")
  while (comma > 0 && DESCRIBING.test(body.slice(0, comma).trim())) {
    body = `${body.slice(0, comma)}${body.slice(comma + 1)}`.replace(
      /\s+/g,
      " "
    )
    comma = body.indexOf(",", comma)
  }
  // A semicolon starts a note too: "kosher salt; for table salt, use half".
  const semicolon = body.indexOf(";")
  if (semicolon > 0 && (comma < 0 || semicolon < comma)) comma = semicolon
  if (comma > 0) {
    note = body.slice(comma + 1).trim() || null
    body = body.slice(0, comma).trim()
  }
  if (sizeNote || asides.length > 0) {
    note = [sizeNote, ...asides, note].filter(Boolean).join(", ")
  }

  return {
    text,
    quantity,
    quantityMax,
    unitId: unit?.id ?? null,
    food: body || null,
    note: note || null,
    parts:
      quantity === null
        ? null
        : { quantity: quantityText, between, unit: unitText, rest: afterUnit },
  }
}

/**
 * A weight in grams the line gives for itself: "(200 g)" in "1½ cups plus
 * 1 Tbsp. (200 g) flour", or "(1½ sticks; 169 g)".
 */
export function statedGrams(
  text: string
): { grams: number; start: number; end: number } | null {
  const match =
    /\((?:[^()]*?[;,]\s*)?(\d+(?:\.\d+)?)\s*(?:g|grams?)\.?\s*\)/i.exec(text)
  if (!match) return null
  return {
    grams: Number(match[1]),
    start: match.index,
    end: match.index + match[0].length,
  }
}

/** "plus 1 Tbsp." right after an amount, as in "1½ cups plus 1 Tbsp. flour". */
export function plusAmount(
  rest: string
): { quantity: number; unitId: string; length: number } | null {
  const lead = /^\s*,?\s*(?:plus\s+|\+\s*)/i.exec(rest)
  if (!lead) return null
  const parsed = parseIngredient(rest.slice(lead[0].length))
  if (parsed.quantity === null || !parsed.unitId || !parsed.parts) return null
  const { quantity, between, unit } = parsed.parts
  const dot = /^\./.test(parsed.parts.rest) ? 1 : 0
  return {
    quantity: parsed.quantity,
    unitId: parsed.unitId,
    length:
      lead[0].length + quantity.length + between.length + unit.length + dot,
  }
}

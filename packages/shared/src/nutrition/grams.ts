import {
  parseIngredient,
  plusAmount,
  statedGrams,
} from "../ingredients/parse.ts"
import { foodKey, HOW_MUCH } from "../list/food.ts"
import { UNITS, type Unit } from "../units/units.ts"
import { bakingDensity } from "../units/weights.ts"

// What an ingredient line weighs, for working out nutrition: from the line
// itself ("(200 g)", "1 lb"), a baking staple's known weight, a USDA food's
// portions ("1 cup chopped = 160 g", "1 medium = 110 g"), or what one of
// that unit was found to weigh before.

/** A household portion from USDA: "1 cup, chopped" weighs 160 g. */
export type Portion = { label: string; amount: number; grams: number }

const UNIT_BY_ID = new Map(UNITS.map((unit) => [unit.id, unit]))

/** An ingredient line, read for weighing. */
export type Weighable = {
  /** The line as written. */
  text: string
  /** The food: "garlic". */
  name: string
  /** The food as matches are kept: "chopped onions" is "onion". */
  key: string
  /** The middle of a range ("2-3" is 2.5). Null when there's no amount. */
  quantity: number | null
  unit: Unit | undefined
  /** A pack size in the line, "1 (15 oz) can", in grams or millilitres. */
  size: { grams: number } | { ml: number } | null
  /** What the line says it weighs: "(200 g)". */
  stated: number | null
  /** A second amount added on: "plus 1 Tbsp.". */
  plus: { quantity: number; unit: Unit } | null
}

/** Not worth counting: water and ice. */
const NOTHING =
  /^(water|ice|ice cubes?|hot water|cold water|warm water|boiling water|lukewarm water)$/i

/**
 * Reads a line for weighing. Null for lines that don't count: "salt to
 * taste", water, a "# Sauce" heading, and lines with no food in them.
 */
export function weighable(text: string): Weighable | null {
  if (text.trim().startsWith("#")) return null
  const parsed = parseIngredient(text)
  if (parsed.quantity === null && HOW_MUCH.test(` ${text}`)) return null
  const name = (parsed.food ?? parsed.text).replace(HOW_MUCH, "").trim()
  if (!name || NOTHING.test(name)) return null
  const quantity =
    parsed.quantity === null
      ? null
      : parsed.quantityMax !== null
        ? (parsed.quantity + parsed.quantityMax) / 2
        : parsed.quantity
  const plus = plusAmount(parsed.parts?.rest ?? "")
  const plusUnit = plus ? UNIT_BY_ID.get(plus.unitId) : undefined
  return {
    text,
    name,
    key: foodKey(name),
    quantity,
    unit: parsed.unitId ? UNIT_BY_ID.get(parsed.unitId) : undefined,
    size: packSize(parsed.parts?.between ?? ""),
    stated: statedGrams(parsed.text)?.grams ?? null,
    plus: plus && plusUnit ? { quantity: plus.quantity, unit: plusUnit } : null,
  }
}

/** "(15 oz)", "(14.5-ounce)", "(400 g)" or "(12 fl oz)". */
function packSize(between: string) {
  const match = /\(\s*([\d.]+)\s*-?\s*([a-z. ]+?)\s*\)/i.exec(between)
  if (!match) return null
  const amount = Number(match[1])
  const word = match[2]!.toLowerCase().replace(/\.$/, "")
  const unit = UNITS.find(
    (u) =>
      u.id === word ||
      u.name === word ||
      u.pluralName === word ||
      u.abbreviation === word ||
      u.aliases.includes(word)
  )
  if (!amount || !unit?.toBase) return null
  return unit.kind === "weight"
    ? { grams: amount * unit.toBase }
    : unit.kind === "volume"
      ? { ml: amount * unit.toBase }
      : null
}

/** Volume words in USDA's portion labels, with millilitres each. */
const PORTION_VOLUMES: [RegExp, number, string][] = [
  [/^(cups?|c)\b/, 236.588, "cup"],
  [/^(tbsp|tablespoons?)\b/, 14.7868, "tablespoon"],
  [/^(tsp|teaspoons?)\b/, 4.92892, "teaspoon"],
  [/^fl oz\b/, 29.5735, "fluid-ounce"],
]

/** Labels that aren't a household portion. */
const NOT_A_PORTION = /\b(racc|nlea|serving|quantity not specified)\b/i

/** Grams per millilitre, from a USDA volume portion: the line's own unit first. */
export function densityOf(portions: readonly Portion[], unitId?: string) {
  const found = portions.flatMap((portion) => {
    const label = portion.label.toLowerCase()
    const volume = PORTION_VOLUMES.find(([pattern]) => pattern.test(label))
    return volume
      ? [{ id: volume[2], perMl: portion.grams / (portion.amount * volume[1]) }]
      : []
  })
  return (found.find((f) => f.id === unitId) ?? found[0])?.perMl ?? null
}

const SIZES = ["medium", "large", "small", "extra large", "jumbo"]

/** Grams for one of something counted: "1 clove", "1 large", "1 medium". */
function eachGrams(portions: readonly Portion[], amount: Weighable) {
  const usable = portions.filter(
    (p) =>
      !NOT_A_PORTION.test(p.label) &&
      !PORTION_VOLUMES.some(([pattern]) => pattern.test(p.label.toLowerCase()))
  )
  const per = (p: Portion) => p.grams / p.amount
  const has = (p: Portion, word: string) =>
    new RegExp(`\\b${word}s?\\b`, "i").test(p.label)
  if (amount.unit) {
    const unit = amount.unit
    const match = usable.find(
      (p) => has(p, unit.name) || has(p, unit.pluralName)
    )
    return match ? per(match) : null
  }
  // "3 large eggs": the size in the line, else medium, else the first.
  const size = SIZES.find((s) =>
    new RegExp(`\\b${s}\\b`, "i").test(amount.text)
  )
  for (const word of [size, "medium"].filter(Boolean) as string[]) {
    const match = usable.find((p) => has(p, word))
    if (match) return per(match)
  }
  return usable[0] ? per(usable[0]) : null
}

/** Hardly anything, but not nothing. */
const TINY: Record<string, number> = { pinch: 0.36, dash: 0.6 }

/**
 * What the amount in a line weighs: from the line, a baking staple's weight
 * or the USDA food's portions, else from what one of that unit was found to
 * weigh before (`known`, by unit id or "each"). Null when it can't be told.
 */
export function gramsFor(
  amount: Weighable,
  portions: readonly Portion[],
  known: Record<string, number> = {}
): number | null {
  const { quantity, unit } = amount
  if (quantity === null) return null
  if (amount.stated) return amount.stated
  // "1 cup plus 2 tbsp": the extra in the same kind of unit.
  const extra =
    amount.plus &&
    amount.plus.unit.kind === unit?.kind &&
    amount.plus.unit.toBase
      ? amount.plus.quantity * amount.plus.unit.toBase
      : 0
  if (unit?.kind === "weight" && unit.toBase) {
    return quantity * unit.toBase + extra
  }
  if (unit && TINY[unit.id]) return quantity * TINY[unit.id]!

  // "1 (15 oz) can": the can's own weight, or its volume by density.
  if (amount.size && unit?.kind === "count") {
    if ("grams" in amount.size) return quantity * amount.size.grams
    const perMl = densityOf(portions)
    if (perMl) return quantity * amount.size.ml * perMl
  }

  if (unit?.kind === "volume" && unit.toBase) {
    const perMl = bakingDensity(amount.name) ?? densityOf(portions, unit.id)
    if (perMl) return (quantity * unit.toBase + extra) * perMl
  } else {
    const each = eachGrams(portions, amount)
    if (each) return quantity * each
  }

  const learned = known[unit?.id ?? "each"]
  return learned ? quantity * learned : null
}

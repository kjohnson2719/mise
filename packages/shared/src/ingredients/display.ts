import {
  convertAmount,
  type Conversion,
  type UnitSystem,
} from "../units/convert.ts"
import { METRIC_UNIT_IDS, UNITS_BY_ID } from "../units/units.ts"
import {
  parseIngredient,
  plusAmount,
  statedGrams,
  type ParsedIngredient,
} from "./parse.ts"

const FRACTIONS: [number, string][] = [
  [0, ""],
  [1 / 8, "⅛"],
  [1 / 4, "¼"],
  [1 / 3, "⅓"],
  [3 / 8, "⅜"],
  [1 / 2, "½"],
  [5 / 8, "⅝"],
  [2 / 3, "⅔"],
  [3 / 4, "¾"],
  [7 / 8, "⅞"],
  [1, ""],
]

/**
 * Kitchen-friendly amounts: 1.5 is "1 ½", 0.333 is "⅓", 2.4 is "2 ⅜" (the
 * nearest eighth or third). Metric amounts, big amounts and tiny ones stay
 * decimal.
 */
export function formatQuantity(value: number, { metric = false } = {}) {
  if (!Number.isFinite(value)) return ""
  if (metric || value >= 20 || value < 0.1) {
    const rounded =
      value >= 10 ? Math.round(value) : Math.round(value * 100) / 100
    return String(rounded)
  }
  let whole = Math.floor(value)
  const remainder = value - whole
  let best = FRACTIONS[0]!
  for (const candidate of FRACTIONS) {
    if (Math.abs(candidate[0] - remainder) < Math.abs(best[0] - remainder)) {
      best = candidate
    }
  }
  if (best[0] === 1) {
    whole += 1
    best = FRACTIONS[0]!
  }
  if (!whole) return best[1] || "0"
  return best[1] ? `${whole} ${best[1]}` : String(whole)
}

/** An amount the way it's measured in that unit: whole grams, ml to the nearest 10. */
function formatIn(unitId: string, value: number) {
  if (unitId === "gram") {
    return String(
      value < 10 ? Math.round(value * 2) / 2 || 0.5 : Math.round(value)
    )
  }
  if (unitId === "milliliter") {
    const step = value < 20 ? 1 : value < 100 ? 5 : 10
    return String(Math.round(value / step) * step || 1)
  }
  return formatQuantity(value, { metric: METRIC_UNIT_IDS.has(unitId) })
}

/** "g", "tbsp", "cups": short where there's a short form. */
function unitLabel(unitId: string, plural: boolean) {
  const unit = UNITS_BY_ID.get(unitId)!
  if (unit.id === "cup" || !unit.abbreviation) {
    return plural ? unit.pluralName : unit.name
  }
  return unit.abbreviation
}

/** An ingredient line split for showing: its amount, and the rest of it. */
export type IngredientDisplay = { amount: string; rest: string }

/** The amount as written, scaled, the kitchen way ("1 1/2" is "1 ½"). */
function asWritten(
  parsed: ParsedIngredient & { quantity: number },
  parts: NonNullable<ParsedIngredient["parts"]>,
  factor: number
): IngredientDisplay {
  // "a pinch" stays as it is unless it's scaled.
  if (factor === 1 && !/^\d/.test(parts.quantity)) {
    return {
      amount: parts.quantity + parts.between + parts.unit,
      rest: parts.rest,
    }
  }
  const metric = parsed.unitId ? METRIC_UNIT_IDS.has(parsed.unitId) : false
  const amount = parsed.quantity * factor
  let quantity = formatQuantity(amount, { metric })
  if (parsed.quantityMax !== null) {
    quantity += `–${formatQuantity(parsed.quantityMax * factor, { metric })}`
  }

  let unit = parts.unit
  const known = parsed.unitId ? UNITS_BY_ID.get(parsed.unitId) : undefined
  if (known) {
    const word = unit.trim()
    const plural = (parsed.quantityMax ?? amount) > 1
    if (word.toLowerCase() === known.name && plural) {
      unit = unit.replace(word, known.pluralName)
    } else if (word.toLowerCase() === known.pluralName && !plural) {
      unit = unit.replace(word, known.name)
    }
  }
  return { amount: `${quantity}${parts.between}${unit}`, rest: parts.rest }
}

/** The amount in metric or US units, or null when it's best as written. */
function converted(
  parsed: ParsedIngredient & { quantity: number },
  parts: NonNullable<ParsedIngredient["parts"]>,
  factor: number,
  system: "metric" | "us"
): IngredientDisplay | null {
  const restStart = parsed.text.length - parts.rest.length
  const stated = statedGrams(parsed.text)
  let rest = parts.rest
  let conversion: Conversion | null

  if (system === "metric" && stated && stated.start >= restStart) {
    // The recipe gives its own weight: "1 cup (120 g) flour". Use it.
    const grams = stated.grams * factor
    conversion =
      grams >= 1000
        ? { quantity: grams / 1000, quantityMax: null, unitId: "kilogram" }
        : { quantity: grams, quantityMax: null, unitId: "gram" }
    rest = parsed.text.slice(stated.end)
  } else {
    let quantity = parsed.quantity
    // "1½ cups plus 1 Tbsp. flour": the extra goes in the same amount.
    const plus = plusAmount(rest)
    const unit = parsed.unitId ? UNITS_BY_ID.get(parsed.unitId) : undefined
    const plusUnit = plus ? UNITS_BY_ID.get(plus.unitId) : undefined
    if (
      plus &&
      unit?.toBase &&
      plusUnit?.toBase &&
      unit.kind === plusUnit.kind
    ) {
      quantity += (plus.quantity * plusUnit.toBase) / unit.toBase
      rest = rest.slice(plus.length)
    }
    conversion = convertAmount(
      {
        quantity: quantity * factor,
        quantityMax:
          parsed.quantityMax === null ? null : parsed.quantityMax * factor,
        unitId: parsed.unitId,
        food: parsed.food,
      },
      system
    )
  }
  if (!conversion) return null

  let amount = formatIn(conversion.unitId, conversion.quantity)
  if (conversion.quantityMax !== null) {
    amount += `–${formatIn(conversion.unitId, conversion.quantityMax)}`
  }
  // Plural by what's shown: 1.06 cups shows as "1 cup".
  const top = conversion.quantityMax ?? conversion.quantity
  const plural = top > 1 && formatIn(conversion.unitId, top) !== "1"
  return {
    amount: `${amount} ${unitLabel(conversion.unitId, plural)}`,
    rest,
  }
}

/**
 * An ingredient line ready to show: its amount, multiplied by `factor` and
 * in the chosen units, and the rest of the line as written. A line without
 * an amount comes back with an empty `amount`.
 */
export function displayIngredient(
  line: string,
  {
    factor = 1,
    system = "written",
  }: { factor?: number; system?: UnitSystem } = {}
): IngredientDisplay {
  const parsed = parseIngredient(line)
  const { parts, quantity } = parsed
  if (quantity === null || !parts) return { amount: "", rest: parsed.text }
  const withQuantity = { ...parsed, quantity }
  if (system !== "written") {
    const shown = converted(withQuantity, parts, factor, system)
    if (shown) return shown
  }
  return asWritten(withQuantity, parts, factor)
}

/** The line with its amount scaled, as one string. */
export function scaleIngredient(line: string, factor: number) {
  const { amount, rest } = displayIngredient(line, { factor })
  return amount + rest
}

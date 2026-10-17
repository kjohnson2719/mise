import { METRIC_UNIT_IDS, SPOON_UNIT_IDS, UNITS_BY_ID } from "./units.ts"
import { bakingDensity, isLiquid, STICK_OF_BUTTER_GRAMS } from "./weights.ts"

/** How amounts are shown: as the recipe has them, or all metric, or all US. */
export const UNIT_SYSTEMS = ["written", "metric", "us"] as const
export type UnitSystem = (typeof UNIT_SYSTEMS)[number]

/** An amount in another unit. */
export type Conversion = {
  quantity: number
  quantityMax: number | null
  unitId: string
}

/** Picks the unit to show an amount in, from how much there is. */
type Target = (base: number) => { unitId: string; perUnit: number }

const METRIC_WEIGHT: Target = (grams) =>
  grams >= 1000
    ? { unitId: "kilogram", perUnit: 1000 }
    : { unitId: "gram", perUnit: 1 }

const METRIC_VOLUME: Target = (ml) =>
  ml >= 1000
    ? { unitId: "liter", perUnit: 1000 }
    : { unitId: "milliliter", perUnit: 1 }

const US_VOLUME: Target = (ml) =>
  ml < 14
    ? { unitId: "teaspoon", perUnit: 4.92892 }
    : ml < 59
      ? { unitId: "tablespoon", perUnit: 14.7868 }
      : { unitId: "cup", perUnit: 236.588 }

const US_WEIGHT: Target = (grams) =>
  grams < 453.592
    ? { unitId: "ounce", perUnit: 28.3495 }
    : { unitId: "pound", perUnit: 453.592 }

function into(
  target: Target,
  base: number,
  baseMax: number | null
): Conversion {
  const { unitId, perUnit } = target(base)
  return {
    quantity: base / perUnit,
    quantityMax: baseMax === null ? null : baseMax / perUnit,
    unitId,
  }
}

/**
 * An amount in metric or US units, or null when it's fine as it is: already
 * in that system, a spoon (the same everywhere), or a count like "2 eggs".
 * Dry baking staples measured by volume become grams in metric ("1 cup
 * flour" is 120 g), and grams become cups in US, as bakers there measure.
 */
export function convertAmount(
  amount: {
    quantity: number
    quantityMax: number | null
    unitId: string | null
    food: string | null
  },
  system: "metric" | "us"
): Conversion | null {
  const unit = amount.unitId ? UNITS_BY_ID.get(amount.unitId) : undefined
  if (!unit) return null
  const food = amount.food ?? ""
  const base = (quantity: number) => quantity * (unit.toBase ?? 0)
  const max = amount.quantityMax

  if (system === "metric") {
    if (METRIC_UNIT_IDS.has(unit.id) || SPOON_UNIT_IDS.has(unit.id)) {
      return null
    }
    if (unit.id === "stick" && /\bbutter\b/i.test(food)) {
      return into(
        METRIC_WEIGHT,
        amount.quantity * STICK_OF_BUTTER_GRAMS,
        max === null ? null : max * STICK_OF_BUTTER_GRAMS
      )
    }
    if (unit.kind === "weight") {
      return into(
        METRIC_WEIGHT,
        base(amount.quantity),
        max === null ? null : base(max)
      )
    }
    if (unit.kind === "volume") {
      const density = isLiquid(food) ? null : bakingDensity(food)
      const weigh = (ml: number) => (density ? ml * density : ml)
      return into(
        density ? METRIC_WEIGHT : METRIC_VOLUME,
        weigh(base(amount.quantity)),
        max === null ? null : weigh(base(max))
      )
    }
    return null
  }

  if (!METRIC_UNIT_IDS.has(unit.id)) return null
  if (unit.kind === "volume") {
    return into(
      US_VOLUME,
      base(amount.quantity),
      max === null ? null : base(max)
    )
  }
  const grams = base(amount.quantity)
  const density = bakingDensity(food)
  if (density && grams <= 2000) {
    return into(
      US_VOLUME,
      grams / density,
      max === null ? null : base(max) / density
    )
  }
  return into(US_WEIGHT, grams, max === null ? null : base(max))
}

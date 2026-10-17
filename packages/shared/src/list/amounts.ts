import {
  householdKey,
  NO_ALIASES,
  type FoodAliases,
} from "../foods/household.ts"
import { foodUnits, gramsEach } from "../foods/vocabulary.ts"
import { formatQuantity } from "../ingredients/display.ts"
import { parseIngredient } from "../ingredients/parse.ts"
import { METRIC_UNIT_IDS, UNITS_BY_ID, type Unit } from "../units/units.ts"
import { bakingDensity } from "../units/weights.ts"
import { lineFoods } from "./food.ts"

// Adding up what to buy: the same food across recipes in one line, volumes
// and weights converted as they're added, and each planned meal's share
// kept, so taking a meal off the plan takes its share off the list.

/** An amount on the list: a number and a unit (an id from UNITS), or none. */
export type Amount = { quantity: number | null; unit: string | null }

/** How much of a line is for one planned meal. */
export type MealShare = Amount & { meal: string }

export type ListLine = {
  /** An ingredient line as written, "1 ½ cups milk". */
  text: string
  /** How much it's scaled by: the planned servings over the recipe's. */
  factor: number
  /** Where it's from: a recipe's name. */
  source: string
  /** The planned meal it's for. */
  meal?: string
  /**
   * The food a person or AI said the line is, when it names one: it wins
   * over the vocabulary.
   */
  food?: string | null
}

export type CombinedItem = Amount & {
  /** The food and how it's measured: same key, one line on the list. */
  key: string
  food: string
  name: string
  sources: string[]
  shares: MealShare[]
}

const round = (value: number) => Math.round(value * 1000) / 1000

const unitOf = (id: string | null) =>
  id ? (UNITS_BY_ID.get(id) ?? null) : null

/** Measured by volume or weight, so it converts. */
const converts = (unit: Unit | null): unit is Unit & { toBase: number } =>
  unit !== null && unit.toBase !== null

/**
 * An amount in a food's own terms (the vocabulary's units for it): heads
 * of garlic as cloves, sticks of butter as cups.
 */
function inFoodUnits(food: string | undefined, amount: Amount): Amount {
  const as = foodUnits(food)[amount.unit ?? "each"]
  if (!as) return amount
  return {
    quantity: amount.quantity === null ? null : amount.quantity * as.quantity,
    unit: as.unit,
  }
}

/** Back to a food's bigger unit when it comes out whole: 2 heads of garlic. */
function inWholeUnits(food: string | undefined, amount: Amount): Amount {
  if (!food || amount.quantity === null) return amount
  for (const [unit, as] of Object.entries(foodUnits(food))) {
    if (!as.back || amount.unit !== as.unit) continue
    const whole = amount.quantity / as.quantity
    if (Number.isInteger(round(whole))) return { quantity: round(whole), unit }
  }
  return amount
}

/**
 * How an amount of a food adds up: what it's measured in, and how much in
 * that measure's base. Volumes are in ml and weights in g, except a
 * baking staple's, which are both in grams so a cup of flour and 100 g of
 * it add up; counts are in their own unit.
 */
function measureOf(food: string | undefined, amount: Amount) {
  if (amount.quantity === null) return null
  const unit = unitOf(amount.unit)
  if (!converts(unit)) {
    return { measure: `count:${amount.unit ?? "each"}`, base: amount.quantity }
  }
  const density = food ? bakingDensity(food) : null
  if (density !== null) {
    const grams = unit.kind === "volume" ? unit.toBase * density : unit.toBase
    return { measure: "mass", base: amount.quantity * grams }
  }
  return { measure: unit.kind, base: amount.quantity * unit.toBase }
}

const isWeight = (measure: string) => measure === "weight" || measure === "mass"

/**
 * How so many of a food and a weight of it add up, when Merran knows what
 * one weighs (6 carrots and 450 g of them): the second into a count, or
 * into a weight. Null when they don't.
 */
function eachOrWeight(
  food: string | undefined,
  first: string,
  second: string
): "to count" | "to weight" | null {
  if (!food || gramsEach(food) === null) return null
  if (first === "count:each" && isWeight(second)) return "to count"
  if (isWeight(first) && second === "count:each") return "to weight"
  return null
}

/**
 * So many of something, with some of it from a weight: whole ones,
 * rounded up unless it's only just over. 12.4 carrots are 13; 4.02
 * onions, 4.
 */
const wholeCount = (count: number) =>
  count <= 0 ? 0 : Math.max(1, Math.ceil(round(count) - 0.1))

/** How many of a measure's base one of a unit is, for a food. */
function baseOf(food: string | undefined, unit: Unit & { toBase: number }) {
  const density = food ? bakingDensity(food) : null
  return density !== null && unit.kind === "volume"
    ? unit.toBase * density
    : unit.toBase
}

type Group = {
  key: string
  food: string
  name: string
  /** What it's measured in (see measureOf), or "none" without an amount. */
  measure: string
  /** In the measure's base; in the unit (or each) for a count. */
  total: number | null
  unit: string | null
  /** The unit to show it in: the biggest of the first kind used. */
  showUnit: (Unit & { toBase: number }) | null
  /** So many, some of it from a weight, so shown as whole ones. */
  whole?: true
  sources: Set<string>
  /** Each meal's share, in the same measure as the total. */
  shares: Map<string, number | null>
}

/**
 * Adds up ingredient lines into what to buy. The same food is one line
 * across recipes, however it's named ("plain flour" and "all-purpose
 * flour"); volumes and weights are converted as they're added (a baking
 * staple's into each other: a cup of flour and 100 g of it), a food's own
 * units too (a head of garlic is ten cloves), and other counts stay in
 * their own unit (2 cans and 1 lb of tomatoes stay apart). A line without
 * an amount ("salt to taste") is listed once, without one, unless the food
 * has an amount elsewhere. Ranges buy the top: 3 for "2-3 cloves". A
 * household's own names for foods (`aliases`) win over the vocabulary's.
 */
export function combineLines(
  lines: readonly ListLine[],
  aliases: FoodAliases = NO_ALIASES
): CombinedItem[] {
  const groups = new Map<string, Group>()

  // Each food a line names ("salt and pepper" is two), as the household
  // has it: a food someone chose for the line, then its own names.
  const foods = lines.flatMap((line) => {
    const named = lineFoods(line.text)
    return named.map((food) => ({
      line,
      food,
      foodKey: householdKey(
        food.name,
        line.food && named.length === 1 ? line.food : food.key,
        aliases
      ),
    }))
  })
  for (const { line, food: each, foodKey } of foods) {
    const name = each.name
    const food = foodKey
    const top = each.quantityMax ?? each.quantity
    const amount = inFoodUnits(food, {
      quantity: top === null ? null : top * line.factor,
      unit: each.unitId,
    })
    const found = measureOf(food, amount)
    const measure = found?.measure ?? "none"
    const key = `${food}|${measure}`
    const unit = unitOf(amount.unit)

    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        food,
        name,
        measure,
        total: found ? 0 : null,
        unit: converts(unit) ? null : amount.unit,
        showUnit: null,
        sources: new Set(),
        shares: new Map(),
      }
      groups.set(key, group)
    }
    group.sources.add(line.source)
    let added: number | null = null
    if (found && group.total !== null) {
      added = found.base
      group.total += added
      if (
        converts(unit) &&
        (!group.showUnit ||
          (unit.kind === group.showUnit.kind &&
            unit.toBase > group.showUnit.toBase))
      )
        group.showUnit = unit
    }
    if (line.meal) {
      const before = group.shares.get(line.meal)
      group.shares.set(
        line.meal,
        added === null ? (before ?? null) : (before ?? 0) + added
      )
    }
  }

  // So many of a food and a weight of it are one line, by what one weighs:
  // 6 carrots and 450 g of them are 13 carrots, in the first one's terms.
  for (const group of [...groups.values()]) {
    if (!groups.has(group.key) || group.total === null) continue
    for (const other of [...groups.values()]) {
      if (other === group || other.food !== group.food) continue
      if (other.total === null) continue
      const per = eachOrWeight(group.food, group.measure, other.measure)
      if (!per) continue
      const grams = gramsEach(group.food)!
      const into = (value: number) =>
        per === "to count" ? value / grams : value * grams
      group.total += into(other.total)
      for (const [meal, share] of other.shares) {
        const before = group.shares.get(meal) ?? null
        group.shares.set(
          meal,
          share === null ? before : (before ?? 0) + into(share)
        )
      }
      for (const source of other.sources) group.sources.add(source)
      if (per === "to count") group.whole = true
      groups.delete(other.key)
    }
  }

  // A food with an amount somewhere doesn't also need an "as needed" line.
  for (const [key, group] of groups) {
    if (group.measure !== "none") continue
    const sibling = [...groups.values()].find(
      (other) => other !== group && other.food === group.food
    )
    if (!sibling) continue
    for (const source of group.sources) sibling.sources.add(source)
    for (const meal of group.shares.keys())
      if (!sibling.shares.has(meal)) sibling.shares.set(meal, 0)
    groups.delete(key)
  }

  return [...groups.values()].map((group) => {
    const show = (value: number | null): Amount => {
      if (value === null) return { quantity: null, unit: null }
      const unit = group.showUnit
      if (group.whole) return { quantity: wholeCount(value), unit: group.unit }
      return inWholeUnits(group.food, {
        quantity: round(unit ? value / baseOf(group.food, unit) : value),
        unit: unit?.id ?? group.unit,
      })
    }
    const total = show(group.total)
    return {
      key: group.key,
      food: group.food,
      name: group.name,
      quantity: total.quantity,
      unit:
        total.quantity === null
          ? (group.showUnit?.id ?? group.unit)
          : total.unit,
      sources: [...group.sources],
      shares: [...group.shares].map(([meal, value]) => ({
        meal,
        ...show(value),
      })),
    }
  })
}

/**
 * One amount plus another, when they add up: the same unit, volumes and
 * weights (converted, in the bigger unit), and with the food, its own
 * units (a head of garlic is ten cloves) and a baking staple's volume and
 * weight (into the first one's unit). Null when they don't, so they stay
 * apart.
 */
export function addAmounts(a: Amount, b: Amount, food?: string): Amount | null {
  const x = inFoodUnits(food, a)
  const y = inFoodUnits(food, b)
  if (x.quantity === null || y.quantity === null) {
    return x.unit === y.unit
      ? inWholeUnits(food, { quantity: x.quantity ?? y.quantity, unit: x.unit })
      : null
  }
  if (x.unit === y.unit) {
    return inWholeUnits(food, {
      quantity: round(x.quantity + y.quantity),
      unit: x.unit,
    })
  }
  const mx = measureOf(food, x)
  const my = measureOf(food, y)
  const ux = unitOf(x.unit)
  const uy = unitOf(y.unit)
  if (!mx || !my) return null
  if (mx.measure !== my.measure) {
    // So many and a weight: by what one weighs, in the first one's terms.
    const per = eachOrWeight(food, mx.measure, my.measure)
    if (per === "to count") {
      return {
        quantity: wholeCount(mx.base + my.base / gramsEach(food!)!),
        unit: x.unit,
      }
    }
    if (per === "to weight" && converts(ux)) {
      const grams = mx.base + my.base * gramsEach(food!)!
      return { quantity: round(grams / baseOf(food, ux)), unit: ux.id }
    }
    return null
  }
  if (!converts(ux) || !converts(uy)) return null
  // The bigger of the two, unless one's a weight and one a volume: then
  // the one already there.
  const shown = ux.kind !== uy.kind || ux.toBase >= uy.toBase ? ux : uy
  return {
    quantity: round((mx.base + my.base) / baseOf(food, shown)),
    unit: shown.id,
  }
}

/**
 * Two amounts of one food as one line on the list: added up where they
 * add, and where one has none ("salt to taste"), the other. Null when
 * they stay two lines.
 */
export function joinAmounts(
  a: Amount,
  b: Amount,
  food?: string
): Amount | null {
  return (
    addAmounts(a, b, food) ??
    (a.quantity === null ? b : b.quantity === null ? a : null)
  )
}

/**
 * What's left of one amount after taking another, in the first one's unit
 * (with the food, a food's own units and a baking staple's volume and
 * weight compare too). Null when they don't compare (or either has no
 * amount). Can go below zero.
 */
export function subtractAmounts(
  have: Amount,
  take: Amount,
  food?: string
): { quantity: number; unit: string | null } | null {
  const h = inFoodUnits(food, have)
  const t = inFoodUnits(food, take)
  if (h.quantity === null || t.quantity === null) return null
  if (h.unit === t.unit)
    return { quantity: round(h.quantity - t.quantity), unit: h.unit }
  const mh = measureOf(food, h)
  const mt = measureOf(food, t)
  const uh = unitOf(h.unit)
  if (!mh || !mt || mh.measure !== mt.measure || !converts(uh)) return null
  return {
    quantity: round((mh.base - mt.base) / baseOf(food, uh)),
    unit: h.unit,
  }
}

/**
 * How many of one amount are in another, for a food, when they compare:
 * 2 cups of flour are 0.53 of a 5 lb bag; 3 eggs a quarter of a dozen.
 */
export function amountRatio(
  part: Amount,
  whole: Amount,
  food?: string
): number | null {
  const p = measureOf(food, inFoodUnits(food, part))
  const w = measureOf(food, inFoodUnits(food, whole))
  if (!p || !w || p.measure !== w.measure || w.base <= 0) return null
  return p.base / w.base
}

/** "1 ½ cups", "3", "2 cans", "500 g". Empty when there's no amount. */
export function formatAmount(quantity: number | null, unit: string | null) {
  if (quantity === null) return ""
  const found = unitOf(unit)
  const number = formatQuantity(quantity, {
    metric: unit ? METRIC_UNIT_IDS.has(unit) : false,
  })
  if (!found) return number
  // "2 lb" and "1 tbsp" read well; "2 c" doesn't, so cups are spelled out.
  const label =
    found.abbreviation && found.kind !== "count" && found.id !== "cup"
      ? found.abbreviation
      : quantity > 1
        ? found.pluralName
        : found.name
  return `${number} ${label}`
}

/**
 * An amount as typed: "2 lb" is a number and a unit, "half a bag" stays as
 * written. Empty is no amount.
 */
export function readAmount(
  text: string
): Amount & { amountText: string | null } {
  const typed = text.trim()
  if (!typed) return { quantity: null, unit: null, amountText: null }
  const parsed = parseIngredient(`${typed} x`)
  return parsed.quantity !== null && parsed.food === "x"
    ? {
        quantity: parsed.quantityMax ?? parsed.quantity,
        unit: parsed.unitId,
        amountText: null,
      }
    : { quantity: null, unit: null, amountText: typed }
}

/**
 * Something typed onto the list: "2 lb ground beef" is ground beef, 2 lb;
 * "paper towels" is just that.
 */
export function readItem(text: string) {
  const typed = text.trim()
  const parsed = parseIngredient(typed)
  const name = parsed.food?.trim()
  if (parsed.quantity === null || !name)
    return { name: typed, quantity: null, unit: null }
  return {
    name,
    quantity: parsed.quantityMax ?? parsed.quantity,
    unit: parsed.unitId,
  }
}

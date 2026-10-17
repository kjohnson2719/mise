import { kindOf } from "../foods/kinds.ts"
import { gramsEach } from "../foods/vocabulary.ts"
import { guessAisle } from "./aisles.ts"
import { amountRatio, type Amount } from "./amounts.ts"
import { lineFoods } from "./food.ts"
import { priceNow, type StoreProduct } from "./products.ts"

// What things cost at the household's store: a pack's size as an amount,
// how many packs an amount takes, and what a recipe comes to from its
// lines' share of each product's price.

/** The units a store's size is written in, as Merran's unit ids. */
const SIZE_UNITS: Record<string, string | null> = {
  "fl oz": "fluid-ounce",
  floz: "fluid-ounce",
  oz: "ounce",
  lb: "pound",
  lbs: "pound",
  g: "gram",
  kg: "kilogram",
  ml: "milliliter",
  l: "liter",
  lt: "liter",
  gal: "gallon",
  qt: "quart",
  pt: "pint",
  ct: null,
  count: null,
  pk: null,
  pack: null,
  each: null,
  ea: null,
}

const SIZE =
  /(\d+(?:\.\d+)?)\s*(fl\.?\s*oz|floz|oz|lbs?|kg|g|ml|lt|l|gal|qt|pt|ct|count|pk|pack|each|ea)\b/i

/**
 * What a pack holds, as an amount: "1 lb" is a pound, "12 ct" is 12, "6 ct
 * / 12 fl oz" is 6 (the first said). Null when the size doesn't say.
 */
export function sizeAmount(size: string | null | undefined): Amount | null {
  const found = size?.match(SIZE)
  if (!found) return null
  const word = found[2]!
    .toLowerCase()
    .replace(/\.\s*/g, " ")
    .replace(/\s+/g, " ")
  const unit = SIZE_UNITS[word] ?? SIZE_UNITS[word.replace(/\s/g, "")] ?? null
  return { quantity: Number(found[1]), unit }
}

/** Bought by the pack whatever's in it: a can of tomatoes is one can. */
const PACK_UNITS = new Set([
  "can",
  "jar",
  "package",
  "box",
  "bag",
  "bottle",
  "container",
  "carton",
  "tub",
  "envelope",
  "block",
  "loaf",
  "sleeve",
  "bunch",
  "head",
])

/**
 * How many packs of a product an amount of a food takes, as a fraction:
 * 2 cups of flour are 0.53 of a 5 lb bag, a can of tomatoes one can, 2
 * onions 0.33 of a 3 lb bag (going by what an onion weighs). Null when they
 * don't compare.
 */
export function packsFor(
  food: string,
  need: Amount,
  size: string | null | undefined
): number | null {
  if (need.quantity === null || need.quantity <= 0) return null
  const pack = sizeAmount(size)
  const ratio = pack ? amountRatio(need, pack, food) : null
  if (ratio !== null) return ratio
  if (need.unit && PACK_UNITS.has(need.unit)) return need.quantity
  // So many of something sold by weight: what one usually weighs.
  const each = gramsEach(food)
  if (pack && each && need.unit === null) {
    return amountRatio({ quantity: need.quantity * each, unit: "gram" }, pack)
  }
  return null
}

/** More packs than this for one line means the product's the wrong one. */
const MOST_PACKS = 20

/** A recipe's cost from what its lines take of each product, in cents. */
export type RecipeCost = {
  total: number
  /** Lines with an amount of something bought. */
  counted: number
  /** Of those, the ones with a price. */
  priced: number
  /**
   * A line of meat or fish without a price: most of what the recipe costs,
   * so the rest isn't near it.
   */
  missingMain: boolean
  currency: string | null
}

/**
 * What a recipe costs at the household's store: each line's share of its
 * product's price today (a sale included), for the lines with an amount of
 * something bought (not salt to taste, or what's always at home).
 */
export function recipeCost(
  lines: readonly string[],
  productOf: (food: string) => StoreProduct | undefined,
  {
    today,
    isOnHand = () => false,
  }: { today: string; isOnHand?: (name: string) => boolean }
): RecipeCost {
  const cost: RecipeCost = {
    total: 0,
    counted: 0,
    priced: 0,
    missingMain: false,
    currency: null,
  }
  // Each food a line names, with its amount: "salt and pepper" is two.
  for (const each of lines.flatMap((line) => lineFoods(line))) {
    const name = each.name
    const quantity = each.quantityMax ?? each.quantity
    if (!name || quantity === null || isOnHand(name)) continue
    cost.counted++
    const food = each.key
    // The food's own product, else the product of what it's a kind of: a
    // green bell pepper costs what a bell pepper does.
    const product =
      productOf(food) ??
      kindOf(food)
        .map((kind) => productOf(kind))
        .find(Boolean)
    const price = product ? priceNow(product, today).price : null
    const packs = product
      ? packsFor(food, { quantity, unit: each.unitId }, product.size)
      : null
    // Twenty packs for one line is the wrong product, not a big recipe.
    if (price === null || packs === null || packs > MOST_PACKS) {
      if (guessAisle(name) === "meat-seafood") cost.missingMain = true
      continue
    }
    cost.total += price * packs
    cost.priced++
    cost.currency ??= product?.currency ?? null
  }
  cost.total = Math.round(cost.total)
  return cost
}

/**
 * A cost worth showing, near what the recipe costs: most of its lines have
 * a price (three in five), its meat and fish among them.
 */
export function costShown(cost: RecipeCost | null | undefined) {
  return cost &&
    cost.counted > 0 &&
    !cost.missingMain &&
    cost.priced / cost.counted >= 0.6
    ? cost
    : null
}

/** A planned meal's cost: the recipe's, for the servings planned. */
export function costFor(
  total: number,
  servings: number | null,
  recipeServings: number | null
) {
  return servings && recipeServings
    ? (total * servings) / recipeServings
    : total
}

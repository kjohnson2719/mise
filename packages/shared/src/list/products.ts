import { foodUnits, gramsEach } from "../foods/vocabulary.ts"
import { UNITS_BY_ID } from "../units/units.ts"

// A store's products, as Merran keeps them for the things on a list:
// what one is, what it costs, and how many to buy for an amount.

/** A product at a store, as Merran shows and remembers it. */
export type StoreProduct = {
  /** The store's own id for it. */
  id: string
  /** For a store that adds to a cart by barcode, like Kroger. */
  upc: string | null
  name: string
  brand: string | null
  /** As the store says it: "1 gal", "3 lb bag", "6 ct / 12 fl oz". */
  size: string | null
  image: string | null
  /** In the store's currency's smallest unit (cents), when it says. */
  price: number | null
  salePrice: number | null
  /** The last day of a sale, as "2026-10-21". */
  saleEnds: string | null
  currency: string
  aisle: string | null
  inStock: boolean
  /** Its page on the store's site. */
  url: string | null
}

/** What a product's size holds: a weight, a volume or a count. */
type Held = { kind: "weight" | "volume" | "count"; amount: number }

const SIZE_UNITS: Record<string, { kind: Held["kind"]; base: number }> = {
  "fl oz": { kind: "volume", base: 29.5735 },
  floz: { kind: "volume", base: 29.5735 },
  oz: { kind: "weight", base: 28.3495 },
  lb: { kind: "weight", base: 453.592 },
  lbs: { kind: "weight", base: 453.592 },
  g: { kind: "weight", base: 1 },
  kg: { kind: "weight", base: 1000 },
  ml: { kind: "volume", base: 1 },
  l: { kind: "volume", base: 1000 },
  lt: { kind: "volume", base: 1000 },
  gal: { kind: "volume", base: 3785.41 },
  qt: { kind: "volume", base: 946.353 },
  pt: { kind: "volume", base: 473.176 },
  ct: { kind: "count", base: 1 },
  count: { kind: "count", base: 1 },
  pk: { kind: "count", base: 1 },
  pack: { kind: "count", base: 1 },
  each: { kind: "count", base: 1 },
  ea: { kind: "count", base: 1 },
}

const SIZE =
  /(\d+(?:\.\d+)?)\s*(fl\.?\s*oz|floz|oz|lbs?|kg|g|ml|lt|l|gal|qt|pt|ct|count|pk|pack|each|ea)\b/gi

/**
 * What a product's size says it holds, in grams, millilitres or a count:
 * "1 gal" is 3785 ml; "6 ct / 12 fl oz" is both 6 and 355 ml.
 */
export function readProductSize(size: string | null | undefined): Held[] {
  if (!size) return []
  const held: Held[] = []
  for (const match of size.matchAll(SIZE)) {
    const word = match[2]!
      .toLowerCase()
      .replace(/\.\s*/g, " ")
      .replace(/\s+/g, " ")
    const unit = SIZE_UNITS[word] ?? SIZE_UNITS[word.replace(/\s/g, "")]
    if (unit)
      held.push({ kind: unit.kind, amount: Number(match[1]) * unit.base })
  }
  return held
}

/**
 * How many of a product an amount on the list needs, and whether that's
 * sure: "2 lb" of a "1 lb" pack is 2; 3 eggs from a "12 ct" box is 1. Up to
 * a tenth over a whole package rounds down, so 1.05 lb is one 1 lb pack.
 */
export function packagesFor(
  need: { quantity: number | null; unit: string | null },
  size: string | null | undefined,
  food?: string
): { packages: number; sure: boolean } {
  if (need.quantity === null || need.quantity <= 0) {
    return { packages: 1, sure: true }
  }
  let quantity = need.quantity
  let unitId = need.unit
  // As it's sold, in the food's bigger unit, one at a time: 67 cloves of
  // garlic are 7 heads.
  for (const as of Object.values(foodUnits(food))) {
    if (as.back && as.unit === unitId) {
      quantity /= as.quantity
      unitId = null
      break
    }
  }
  const unit = unitId ? UNITS_BY_ID.get(unitId) : undefined
  const kind = unit?.kind ?? "count"
  const needed = kind === "count" ? quantity : quantity * (unit?.toBase ?? 1)
  const held = readProductSize(size).find((one) => one.kind === kind)
  // So many of something sold by weight, by what one weighs: 13 carrots
  // are two 1 lb bags, at 70 g each.
  const each = !unit && food ? gramsEach(food) : null
  const weighed = readProductSize(size).find((one) => one.kind === "weight")
  if (!held && each && weighed && weighed.amount > 0) {
    return {
      packages: clamp(Math.ceil((quantity * each) / weighed.amount - 0.1)),
      sure: false,
    }
  }
  if (!held || held.amount <= 0) {
    // A count with nothing said: sold one at a time, most likely.
    return kind === "count" && !unit
      ? { packages: clamp(Math.ceil(quantity)), sure: false }
      : { packages: 1, sure: false }
  }
  return {
    packages: clamp(Math.ceil(needed / held.amount - 0.1)),
    sure: true,
  }
}

const clamp = (packages: number) => Math.min(99, Math.max(1, packages))

/** What a product costs now, a sale that hasn't ended included. */
export function priceNow(product: StoreProduct, today: string) {
  const onSale =
    product.salePrice !== null &&
    product.price !== null &&
    product.salePrice < product.price &&
    (product.saleEnds === null || product.saleEnds >= today)
  return {
    price: onSale ? product.salePrice : product.price,
    regular: product.price,
    onSale,
  }
}

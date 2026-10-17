import { addDays, daysBetween } from "../plan/days.ts"
import type { AisleKey } from "./aisles.ts"
import { priceNow, type StoreProduct } from "./products.ts"

// Sales, judged against what a product usually costs at the household's
// store: the lowest in a while, a normal sale, or barely off. Only real
// deals sway what's suggested, as much as the household says.

/** How much Fill the week and the autoplan lean on what's on sale. */
export const SALE_LEANS = ["off", "some", "lots"] as const
export type SaleLean = (typeof SALE_LEANS)[number]

/** How good a sale is: the lowest in a while, a normal sale, barely off. */
export const SALE_VERDICTS = ["lowest", "sale", "small"] as const
export type SaleVerdict = (typeof SALE_VERDICTS)[number]

/** A product's prices as seen on a day, in cents. */
export type PriceSeen = {
  day: string
  price: number | null
  salePrice: number | null
}

/** How far back prices count. */
const HISTORY_DAYS = 90

/** Under this much off isn't worth changing a meal for. */
const SMALL_SALE = 0.1

/** Seen on a few days, at least two weeks apart: enough to say "usually". */
function enoughSeen(days: string[]) {
  if (days.length < 3) return false
  const sorted = [...days].sort()
  return daysBetween(sorted[0]!, sorted.at(-1)!) >= 14
}

const within = (seen: readonly PriceSeen[], today: string) => {
  const from = addDays(today, -HISTORY_DAYS)
  return seen.filter((row) => row.day >= from && row.day <= today)
}

/**
 * What a product usually costs: its most common regular price over the
 * past 90 days, once it's been seen enough. Ties go to the most recent.
 */
export function usualPrice(
  seen: readonly PriceSeen[],
  today: string
): number | null {
  const recent = within(seen, today).filter(
    (row): row is PriceSeen & { price: number } => row.price !== null
  )
  if (!enoughSeen(recent.map((row) => row.day))) return null
  const counts = new Map<number, { count: number; last: string }>()
  for (const row of recent) {
    const found = counts.get(row.price)
    counts.set(row.price, {
      count: (found?.count ?? 0) + 1,
      last: found && found.last > row.day ? found.last : row.day,
    })
  }
  let best: [number, { count: number; last: string }] | null = null
  for (const entry of counts) {
    if (
      !best ||
      entry[1].count > best[1].count ||
      (entry[1].count === best[1].count && entry[1].last > best[1].last)
    ) {
      best = entry
    }
  }
  return best ? best[0] : null
}

export type SaleJudged = {
  verdict: SaleVerdict
  /** What it usually costs, when that's known; else its regular price. */
  usual: number | null
  /** How much is off, 0.25 for a quarter. */
  off: number
}

/**
 * How good a product's sale is today, or null when it isn't on sale: the
 * lowest it's been in a while (with enough seen to say), barely off (under
 * a tenth off what it usually costs), or a normal sale.
 */
export function judgeSale(
  product: StoreProduct,
  seen: readonly PriceSeen[],
  today: string
): SaleJudged | null {
  const now = priceNow(product, today)
  if (!now.onSale || now.price === null) return null
  const usual = usualPrice(seen, today) ?? now.regular
  if (usual === null || usual <= 0) return null
  const off = Math.max(0, (usual - now.price) / usual)
  if (off < SMALL_SALE) return { verdict: "small", usual, off }
  const before = within(seen, today).filter((row) => row.day < today)
  const paid = before
    .map((row) => row.salePrice ?? row.price)
    .filter((price): price is number => price !== null)
  const lowest =
    enoughSeen(before.map((row) => row.day)) &&
    paid.every((price) => now.price! <= price)
  return { verdict: lowest ? "lowest" : "sale", usual, off }
}

/** A deal worth changing a meal for: not barely off. */
export const worthIt = (verdict: SaleVerdict) => verdict !== "small"

// Meat and seafood sales change what's for dinner; produce, a bit.
const AISLE_NUDGE: Partial<Record<AisleKey, number>> = {
  "meat-seafood": 1,
  produce: 0.4,
}
const LEAN_FACTOR: Record<SaleLean, number> = { off: 0, some: 1, lots: 2.5 }
const LEAN_CAP: Record<SaleLean, number> = { off: 0, some: 1.5, lots: 4 }

/**
 * A deal worth giving as a reason for a meal: one that changes what's for
 * dinner (meat, seafood, produce) or the lowest in a while. Flour 11% off
 * is a deal, but not why the cookies were picked.
 */
export function worthSaying(sale: { aisle: AisleKey; verdict: SaleVerdict }) {
  if (!worthIt(sale.verdict)) return false
  return sale.verdict === "lowest" || (AISLE_NUDGE[sale.aisle] ?? 0) >= 0.4
}

/**
 * How much likelier a recipe is to be suggested for what it uses that's on
 * sale. "A little" is about what a good rating adds, so a favorite still
 * beats a so-so recipe with cheap chicken; "a lot" usually wins. Barely-off
 * sales count for nothing, the lowest in a while for more.
 */
export function saleNudge(
  sales: readonly { aisle: AisleKey; verdict: SaleVerdict }[],
  lean: SaleLean
) {
  const total = sales.reduce(
    (sum, sale) =>
      worthIt(sale.verdict)
        ? sum +
          (AISLE_NUDGE[sale.aisle] ?? 0.2) *
            (sale.verdict === "lowest" ? 1.5 : 1)
        : sum,
    0
  )
  return Math.min(total * LEAN_FACTOR[lean], LEAN_CAP[lean])
}

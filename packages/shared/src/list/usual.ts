import { addDays, daysBetween } from "../plan/days.ts"
import { formatAmount } from "./amounts.ts"

// Usual buys: what the household gets every so often, learned from what
// it's bought ("milk about every 6 days"), offered when it's due again:
// "Milk? You last got some Oct 9."

export type PurchaseRecord = {
  /** The pantry's key for it. */
  food: string
  name: string
  boughtOn: string
  quantity: number | null
  unit: string | null
  amountText: string | null
}

export type UsualBuy = {
  food: string
  /** As it was last bought: "milk". */
  name: string
  /** How much it was last: "1 gallon", or empty. */
  amount: string
  /** About how many days apart it's bought. */
  every: number
  lastBought: string
  /** The day it's due again. */
  dueOn: string
}

/** Bought on this many days, at least, to count as usual. */
export const USUAL_AFTER = 3

/** Bought further apart than this isn't a usual buy. */
const MOST_DAYS = 120

function median(values: readonly number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2
}

/**
 * What the household usually buys, from its purchases: foods bought on
 * three days or more, about how far apart, and when each is due again (a
 * little before the usual gap's up). Most overdue first.
 */
export function usualBuys(purchases: readonly PurchaseRecord[]) {
  const byFood = new Map<string, PurchaseRecord[]>()
  for (const purchase of purchases) {
    const list = byFood.get(purchase.food) ?? []
    list.push(purchase)
    byFood.set(purchase.food, list)
  }
  const usual: UsualBuy[] = []
  for (const [food, bought] of byFood) {
    const days = [
      ...new Set(bought.map((purchase) => purchase.boughtOn)),
    ].sort()
    if (days.length < USUAL_AFTER) continue
    const gaps = days
      .slice(1)
      .map((day, index) => daysBetween(days[index]!, day))
    const every = Math.round(median(gaps))
    if (every < 1 || every > MOST_DAYS) continue
    const lastBought = days.at(-1)!
    const last = bought
      .filter((purchase) => purchase.boughtOn === lastBought)
      .at(-1)!
    usual.push({
      food,
      name: last.name,
      amount: last.amountText ?? formatAmount(last.quantity, last.unit),
      every,
      lastBought,
      dueOn: addDays(lastBought, Math.max(1, Math.round(every * 0.85))),
    })
  }
  return usual.sort((a, b) => a.dueOn.localeCompare(b.dueOn))
}

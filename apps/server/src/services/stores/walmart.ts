import {
  formatAmount,
  shoppingName,
  WALMART,
  WALMART_CART_URL,
  type StoreProduct as Product,
} from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { AppError } from "../../core/errors.ts"
import { ShoppingItem, StoreProduct } from "../../database/entities/index.ts"
import { STORE_SETTINGS } from "../../modules/stores/settings.ts"
import { householdToday } from "../pantry/pantry.ts"
import {
  choose,
  foodOf,
  itemsToGet,
  lineFor,
  recordPrices,
  type BasketDeps,
} from "./basket.ts"
import { connectionOf, type StoreDeps } from "./connections.ts"
import { judgeSales } from "./history.ts"

// Walmart, through Merran's browser extension (docs/platform.md, Stores):
// the extension searches Walmart and fills the cart in the person's own
// Walmart tab, and hands back what it found. Merran never talks to Walmart
// itself. Here: what to look for, Merran's pick from what was found, a
// person's own pick, and what went in the cart. Experimental, and off
// until the server admin turns it on.

type Who = { householdId: string; userId: string | null }

/** Walmart on this server, or why not. */
export async function needWalmart(deps: StoreDeps) {
  if (!(await deps.settings.server(STORE_SETTINGS.walmart))) {
    throw new AppError(
      "unprocessable",
      "walmart_off",
      "Walmart isn't turned on on this server. The server admin turns it on in Settings, This server, Stores."
    )
  }
}

/** How much the list says, as it shows it: "½ cup". */
function amountOf(item: ShoppingItem) {
  // Doubles can come back as text from some databases.
  const quantity = item.quantity == null ? null : Number(item.quantity)
  return item.amountText ?? formatAmount(quantity, item.unit ?? null)
}

/** The products kept at Walmart for some foods, by food. */
async function keptFor(em: EntityManager, foods: readonly string[]) {
  return new Map(
    (
      await em.find(StoreProduct, { store: WALMART, food: { $in: [...foods] } })
    ).map((row) => [row.food, row])
  )
}

/**
 * The cart to look over: each thing on the list for Walmart with its
 * product, the one the household picked or Merran's pick, how many and
 * what it cost when last seen; and what's still to find at Walmart, with
 * the words to look for.
 */
export async function walmartBasket(
  deps: StoreDeps,
  em: EntityManager,
  householdId: string
) {
  await needWalmart(deps)
  const connection = await connectionOf(em, householdId, WALMART)
  const items = await itemsToGet(em, WALMART)
  const kept = await keptFor(em, [...new Set(items.map(foodOf))])
  await em.flush()
  const sales = await judgeSales(
    em,
    [...kept.values()].map((row) => row.product),
    await householdToday(em, householdId),
    WALMART
  )
  // Each food once: two lines of milk are one search.
  const toFind = new Map<string, { itemId: string; words: string }>()
  for (const item of items) {
    const food = foodOf(item)
    if (kept.has(food) || toFind.has(food)) continue
    // The food as it's bought: "Pinch of salt" is salt.
    toFind.set(food, { itemId: item.id, words: shoppingName(item.name) })
  }
  return {
    store: "Walmart",
    cartUrl: WALMART_CART_URL,
    sentAt: connection.lastSent?.at ?? null,
    lines: items.map((item) =>
      lineFor(item, kept.get(foodOf(item)), connection, sales)
    ),
    toFind: [...toFind.values()],
  }
}

/**
 * What the extension found at Walmart for things on the list: every price
 * kept, and Merran's pick for each thing without a product of the
 * household's own (the small model's, else the first in stock), kept for
 * its food. A product someone picked is never replaced, only brought up
 * to date when it's found again.
 */
export async function walmartFound(
  deps: BasketDeps,
  em: EntityManager,
  who: Who,
  found: readonly { itemId: string; products: Product[] }[]
) {
  await needWalmart(deps)
  const items = new Map(
    (
      await em.find(ShoppingItem, {
        id: { $in: found.map((one) => one.itemId) },
      })
    ).map((item) => [item.id, item])
  )
  await recordPrices(
    em,
    who.householdId,
    found.flatMap((one) => one.products),
    WALMART
  )
  const kept = await keptFor(em, [...items.values()].map(foodOf))
  const asks: { food: string; text: string; products: Product[] }[] = []
  for (const { itemId, products } of found) {
    const item = items.get(itemId)
    if (!item || products.length === 0) continue
    const food = foodOf(item)
    const row = kept.get(food)
    if (row?.chosen) {
      // The household's own pick, as it is today.
      const now = products.find((product) => product.id === row.product.id)
      if (now) row.product = now
      continue
    }
    if (asks.some((ask) => ask.food === food)) continue
    asks.push({
      food,
      text: [amountOf(item), shoppingName(item.name)].filter(Boolean).join(" "),
      products,
    })
  }
  const picks = await choose(deps, em, who, asks)
  asks.forEach((ask, i) => {
    const product = picks[i]
    if (!product) return
    const row = kept.get(ask.food)
    if (row) row.product = product
    else
      kept.set(
        ask.food,
        em.create(StoreProduct, {
          household: who.householdId,
          store: WALMART,
          food: ask.food,
          product,
          chosen: false,
        })
      )
  })
  // What Walmart had, kept with each food to pick another from later.
  for (const { itemId, products } of found) {
    const item = items.get(itemId)
    const row = item ? kept.get(foodOf(item)) : undefined
    if (row && products.length > 0) row.options = products
  }
  await em.flush()
  return walmartBasket(deps, em, who.householdId)
}

/**
 * What Walmart had for a thing on the list when the extension last looked,
 * to pick another from without looking again: empty if it hasn't looked.
 */
export async function walmartOptions(
  deps: StoreDeps,
  em: EntityManager,
  itemId: string
) {
  await needWalmart(deps)
  const item = await em.findOne(ShoppingItem, { id: itemId })
  if (!item) {
    throw new AppError("not_found", "item_not_found", "That isn't on the list.")
  }
  const row = await em.findOne(StoreProduct, {
    store: WALMART,
    food: foodOf(item),
  })
  return { products: row?.options ?? [] }
}

/**
 * A product a person picked at Walmart for a thing on the list: kept for
 * its food from now on, and never replaced by Merran's picks.
 */
export async function pickWalmartProduct(
  deps: StoreDeps,
  em: EntityManager,
  options: { householdId: string; itemId: string; product: Product }
) {
  await needWalmart(deps)
  const item = await em.findOne(ShoppingItem, { id: options.itemId })
  if (!item) {
    throw new AppError("not_found", "item_not_found", "That isn't on the list.")
  }
  const food = foodOf(item)
  const row =
    (await em.findOne(StoreProduct, { store: WALMART, food })) ??
    em.create(StoreProduct, {
      household: options.householdId,
      store: WALMART,
      food,
      product: options.product,
    })
  row.product = options.product
  row.chosen = true
  await em.flush()
  await recordPrices(em, options.householdId, [options.product], WALMART)
  const connection = await connectionOf(em, options.householdId, WALMART)
  const sales = await judgeSales(
    em,
    [options.product],
    await householdToday(em, options.householdId),
    WALMART
  )
  return lineFor(item, row, connection, sales)
}

/**
 * What the extension put in the Walmart cart: remembered as sent while
 * it's still on the list, so it's left unticked next time, and its
 * product kept as the household's, as its page showed it.
 */
export async function walmartSent(
  deps: StoreDeps,
  em: EntityManager,
  householdId: string,
  lines: readonly {
    itemId: string
    packages: number
    product?: Product | null
  }[]
) {
  await needWalmart(deps)
  const items = new Map(
    (
      await em.find(ShoppingItem, {
        id: { $in: lines.map((line) => line.itemId) },
      })
    ).map((item) => [item.id, item])
  )
  const kept = await keptFor(em, [...items.values()].map(foodOf))
  const sent: Record<string, number> = {}
  const seen: Product[] = []
  for (const line of lines) {
    const item = items.get(line.itemId)
    const row = item ? kept.get(foodOf(item)) : undefined
    if (!item || !row) continue
    // Only the product it was for: the page read is today's price.
    if (line.product && line.product.id === row.product.id) {
      row.product = line.product
      seen.push(line.product)
    }
    row.chosen = true
    sent[line.itemId] = line.packages
  }
  const connection = await connectionOf(em, householdId, WALMART)
  const stillOn = new Set(
    (await itemsToGet(em, WALMART)).map((item) => item.id)
  )
  connection.lastSent = {
    at: new Date().toISOString(),
    items: {
      ...Object.fromEntries(
        Object.entries(connection.lastSent?.items ?? {}).filter(([id]) =>
          stillOn.has(id)
        )
      ),
      ...sent,
    },
  }
  await em.flush()
  await recordPrices(em, householdId, seen, WALMART)
  return {
    sent: Object.keys(sent).length,
    store: "Walmart",
    cartUrl: WALMART_CART_URL,
  }
}

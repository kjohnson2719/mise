import { judgeSale, priceNow, worthIt, type SaleJudged } from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import type { AppDeps } from "../../core/context.ts"
import { StoreConnection, StoreProduct } from "../../database/entities/index.ts"
import { householdToday } from "../pantry/pantry.ts"
import { foodOf, itemsToGet, lineFor } from "./basket.ts"
import { KROGER } from "./connections.ts"
import { priceHistory } from "./history.ts"
import { yourStores } from "./yours.ts"

// What the things on the list cost, each at the store it's bought at: the
// store the household picked a product at for it, newest first, else its
// Kroger store, with Merran's pick there. From the product kept for each
// food and the last price seen for it: no look at the store, so the list
// can ask every time it's opened.

export type ItemPrice = {
  /** The store it's priced at: "Fry's". */
  store: string
  /** For the packages needed, at the sale price when there's a sale. */
  total: number
  packages: number
  /** How many is worked out from the product's size, not a guess. */
  sure: boolean
  /** A real deal (not barely off), with what it takes off. */
  sale: {
    verdict: "lowest" | "sale"
    /** Off the packages needed, in cents. */
    saved: number
    /** Its last day, when the store says. */
    ends: string | null
  } | null
  /** What a package usually costs, when it's on sale. */
  usual: number | null
  /** The product it's priced from: "Kroger 2% Milk". */
  product: string
  /** The day that price was seen. */
  seenOn: string
}

/**
 * The prices of what's left to get on every list, by item id. Things with
 * no product kept for them at a store, or no price, are left out.
 */
export async function listPrices(
  deps: Pick<AppDeps, "settings">,
  em: EntityManager,
  householdId: string
) {
  const items: Record<string, ItemPrice> = {}
  const stores = (await yourStores(deps, em, householdId)).filter(
    (store) => store.connected
  )
  const kroger = stores.find((store) => store.key === KROGER)
  if (stores.length === 0) return { store: null, currency: "USD", items }
  const keys = stores.map((store) => store.key)
  const toGet = await itemsToGet(em)
  const rows = await em.find(
    StoreProduct,
    { store: { $in: keys }, food: { $in: [...new Set(toGet.map(foodOf))] } },
    { orderBy: { updatedAt: "desc" } }
  )
  /** The product a thing's priced from: the household's newest pick, else Merran's at Kroger. */
  const rowFor = (food: string) =>
    rows.find((row) => row.food === food && row.chosen) ??
    (kroger
      ? rows.find((row) => row.food === food && row.store === KROGER)
      : undefined)
  const connections = new Map(
    (await em.find(StoreConnection, { store: { $in: keys } })).map(
      (connection) => [connection.store, connection]
    )
  )
  const today = await householdToday(em, householdId)
  const history = new Map<string, Awaited<ReturnType<typeof priceHistory>>>()
  const sales = new Map<string, Map<string, SaleJudged>>()
  for (const key of keys) {
    const products = rows
      .filter((row) => row.store === key)
      .map((row) => row.product)
    const seen = await priceHistory(
      em,
      products.map((product) => product.id),
      today,
      key
    )
    history.set(key, seen)
    const judged = new Map<string, SaleJudged>()
    for (const product of products) {
      const sale = judgeSale(product, seen.get(product.id) ?? [], today)
      if (sale) judged.set(product.id, sale)
    }
    sales.set(key, judged)
  }
  let currency: string | null = null

  for (const item of toGet) {
    const row = rowFor(foodOf(item))
    if (!row) continue
    const store = stores.find((one) => one.key === row.store)!
    const line = lineFor(
      item,
      row,
      connections.get(row.store) ?? ({ lastSent: null } as StoreConnection),
      sales.get(row.store) ?? new Map()
    )
    if (!line.product) continue
    const now = priceNow(line.product, today)
    if (now.price === null) continue
    currency ??= line.product.currency
    const real = line.sale && worthIt(line.sale.verdict) ? line.sale : null
    const regular = now.regular ?? now.price
    items[item.id] = {
      store: store.name,
      total: now.price * line.packages,
      packages: line.packages,
      sure: line.sure,
      sale: real
        ? {
            verdict: real.verdict === "lowest" ? "lowest" : "sale",
            saved: Math.max(0, regular - now.price) * line.packages,
            ends: line.product.saleEnds,
          }
        : null,
      usual: line.sale?.usual ?? null,
      product: line.product.name,
      seenOn:
        history.get(row.store)?.get(line.product.id)?.at(-1)?.day ??
        row.updatedAt.toISOString().slice(0, 10),
    }
  }
  return {
    store: kroger?.name ?? null,
    currency: currency ?? "USD",
    items,
  }
}

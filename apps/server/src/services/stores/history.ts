import {
  addDays,
  judgeSale,
  type PriceSeen,
  type SaleJudged,
  type StoreProduct as Product,
} from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { StorePrice } from "../../database/entities/index.ts"
import { KROGER } from "./connections.ts"

// The prices a household has seen at its store, by day: what sales are
// judged against, and "usually $4.49".

/** How far back prices are read. */
const HISTORY_DAYS = 90

/** Each product's prices over the past 90 days, by product id. */
export async function priceHistory(
  em: EntityManager,
  productIds: readonly string[],
  today: string,
  store: string = KROGER
) {
  const ids = [...new Set(productIds)]
  const history = new Map<string, PriceSeen[]>()
  if (ids.length === 0) return history
  const rows = await em.find(
    StorePrice,
    {
      store,
      productId: { $in: ids },
      day: { $gte: addDays(today, -HISTORY_DAYS) },
    },
    { orderBy: { day: "asc" } }
  )
  for (const row of rows) {
    const seen: PriceSeen = {
      day: row.day,
      price: row.price ?? null,
      salePrice: row.salePrice ?? null,
    }
    const list = history.get(row.productId)
    if (list) list.push(seen)
    else history.set(row.productId, [seen])
  }
  return history
}

/** How good each product's sale is today, by product id: those on sale. */
export async function judgeSales(
  em: EntityManager,
  products: readonly Product[],
  today: string,
  store: string = KROGER
) {
  const history = await priceHistory(
    em,
    products.map((product) => product.id),
    today,
    store
  )
  const judged = new Map<string, SaleJudged>()
  for (const product of products) {
    const sale = judgeSale(product, history.get(product.id) ?? [], today)
    if (sale) judged.set(product.id, sale)
  }
  return judged
}

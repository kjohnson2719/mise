import {
  formatAmount,
  foodKey,
  packagesFor,
  shoppingName,
  type SaleJudged,
  type StoreProduct as Product,
} from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { generateText, Output } from "ai"
import { z } from "zod"
import type { AppDeps } from "../../core/context.ts"
import { AppError } from "../../core/errors.ts"
import {
  ShoppingItem,
  ShoppingList,
  StorePrice,
  StoreProduct,
  type StoreConnection,
  type StoreLocation,
} from "../../database/entities/index.ts"
import { useAi } from "../ai/run.ts"
import { resolveTask } from "../ai/status.ts"
import { householdToday } from "../pantry/pantry.ts"
import { judgeSales } from "./history.ts"
import {
  accountToken,
  KROGER,
  krogerConnection,
  modalityOf,
  needKrogerApp,
} from "./connections.ts"
import {
  addToCart,
  productsById,
  searchProducts,
  type KrogerApp,
} from "./kroger.ts"

// What goes in a Kroger cart: each thing on the list for Kroger gets a
// product, the one the household picked before or Merran's pick from the
// store's search, with how many and what it costs; then it's sent.

export type BasketDeps = Pick<AppDeps, "settings" | "fetcher" | "ai">

/** Searches at once while picking products. */
const AT_ONCE = 4

/** Products offered to choose from for each thing. */
const OPTIONS = 8

/** The household's store, the app, and its connection; or why not. */
export async function ready(deps: BasketDeps, em: EntityManager) {
  const app = await needKrogerApp(deps)
  const connection = await krogerConnection(em)
  if (!connection?.location) {
    throw new AppError(
      "unprocessable",
      "kroger_no_store",
      "Pick the household's Kroger store first, in Settings, Household, Stores."
    )
  }
  return { app, connection, location: connection.location }
}

/** The food a list item is, as products are kept by. */
export const foodOf = (item: ShoppingItem) => item.foodKey ?? foodKey(item.name)

/** How much of something the list says, as it shows it: "½ cup". */
function amountOf(item: ShoppingItem) {
  // Doubles can come back as text from some databases.
  const quantity = item.quantity == null ? null : Number(item.quantity)
  return item.amountText ?? formatAmount(quantity, item.unit ?? null)
}

/** What's left to get on the list for a store: its own, else those for no store. */
export async function itemsToGet(em: EntityManager, store: string = KROGER) {
  const lists = await em.find(ShoppingList, {})
  const forStore = lists.filter((list) => list.store === store)
  const chosen =
    forStore.length > 0 ? forStore : lists.filter((list) => !list.store)
  return em.find(
    ShoppingItem,
    { list: { $in: chosen.map((list) => list.id) }, checked: false },
    { orderBy: { createdAt: "asc", id: "asc" } }
  )
}

/** Keeps the prices seen today, the latest of the day winning. */
export async function recordPrices(
  em: EntityManager,
  householdId: string,
  products: readonly Product[],
  store: string = KROGER
) {
  if (products.length === 0) return
  const day = await householdToday(em, householdId)
  const kept = new Map(
    (
      await em.find(StorePrice, {
        store,
        day,
        productId: { $in: products.map((product) => product.id) },
      })
    ).map((row) => [row.productId, row])
  )
  for (const product of products) {
    const row =
      kept.get(product.id) ??
      em.create(StorePrice, {
        household: householdId,
        store,
        productId: product.id,
        day,
        currency: product.currency,
      })
    row.price = product.price
    row.salePrice = product.salePrice
    row.saleEnds = product.saleEnds
    kept.set(product.id, row)
  }
  await em.flush()
}

const PICK_SYSTEM = `You pick grocery products for a household's shopping list at their store. For each thing on the list you're given numbered products from the store's search.

- Pick the plain everyday product a home cook means: not a ready meal, a snack version or a flavoured variety unless the list says so.
- A sensible size for the amount, in stock first, then on sale, then the store's own brand.
- null when none of them is the thing.`

const Picks = z.object({
  picks: z.array(z.object({ item: z.number(), choice: z.number().nullable() })),
})

const money = (cents: number | null) =>
  cents === null ? "no price" : `$${(cents / 100).toFixed(2)}`

/**
 * The likeliest product for each thing: the small model's pick when the
 * household has AI, else the first in stock.
 */
export async function choose(
  deps: BasketDeps,
  em: EntityManager,
  who: { householdId: string; userId: string | null },
  asks: { text: string; products: Product[] }[]
): Promise<(Product | null)[]> {
  const first = (products: Product[]) =>
    products.find((product) => product.inStock) ?? products[0] ?? null
  const ai = await resolveTask(deps, em, who.householdId, "shopping")
  if (!ai.ok) return asks.map((ask) => first(ask.products))
  try {
    const listed = asks.map((ask, i) =>
      [
        `${i + 1}. ${ask.text}`,
        ...ask.products.map((product, n) =>
          [
            `   ${n + 1}) ${product.name}`,
            product.size,
            product.salePrice !== null
              ? `on sale ${money(product.salePrice)} (usually ${money(product.price)})`
              : money(product.price),
            product.inStock ? null : "out of stock",
          ]
            .filter(Boolean)
            .join(", ")
        ),
      ].join("\n")
    )
    const { output } = await useAi(
      deps,
      em,
      { ...who, task: "shopping", needs: ["structured"] },
      (model) =>
        generateText({
          model,
          system: PICK_SYSTEM,
          prompt: listed.join("\n\n"),
          output: Output.object({ schema: Picks, name: "product_picks" }),
          maxOutputTokens: 2000,
        })
    )
    const picked = new Map(output.picks.map((pick) => [pick.item, pick.choice]))
    return asks.map((ask, i) => {
      if (!picked.has(i + 1)) return first(ask.products)
      const choice = picked.get(i + 1)
      return choice ? (ask.products[choice - 1] ?? null) : null
    })
  } catch {
    return asks.map((ask) => first(ask.products))
  }
}

/** Searches the store for each food, a few at a time. */
export async function searchAll(
  deps: BasketDeps,
  app: KrogerApp,
  location: StoreLocation,
  terms: string[]
) {
  const results: Product[][] = []
  for (let i = 0; i < terms.length; i += AT_ONCE) {
    results.push(
      ...(await Promise.all(
        terms.slice(i, i + AT_ONCE).map((term) =>
          searchProducts(deps.fetcher, app, {
            term,
            location,
            limit: OPTIONS,
          }).catch(() => [])
        )
      ))
    )
  }
  return results
}

export type BasketLine = {
  itemId: string
  name: string
  amount: string
  product: Product | null
  /** Merran's pick, not one a person chose. */
  suggested: boolean
  packages: number
  /** How many is worked out, not a guess. */
  sure: boolean
  /** Sent last time, so left unticked unless it's ticked again. */
  sent: boolean
  /** How good its sale is, against what it usually costs; null if none. */
  sale: { verdict: SaleJudged["verdict"]; usual: number | null } | null
}

export function lineFor(
  item: ShoppingItem,
  kept: StoreProduct | undefined,
  connection: StoreConnection,
  sales: Map<string, SaleJudged>
): BasketLine {
  const product = kept?.product ?? null
  // Doubles can come back as text from some databases.
  const quantity = item.quantity == null ? null : Number(item.quantity)
  const { packages, sure } = product
    ? packagesFor(
        { quantity, unit: item.unit ?? null },
        product.size,
        foodOf(item)
      )
    : { packages: 1, sure: false }
  return {
    itemId: item.id,
    name: item.name,
    amount: amountOf(item),
    product,
    suggested: Boolean(kept && !kept.chosen),
    packages: connection.lastSent?.items[item.id] ?? packages,
    sure,
    sent: Boolean(connection.lastSent?.items[item.id]),
    sale: (() => {
      const judged = product ? sales.get(product.id) : undefined
      return judged ? { verdict: judged.verdict, usual: judged.usual } : null
    })(),
  }
}

/**
 * The cart to look over before sending: each thing on the list for
 * Kroger with its product (refreshed, with today's price), and Merran's
 * pick for things without one.
 */
export async function krogerBasket(
  deps: BasketDeps,
  em: EntityManager,
  who: { householdId: string; userId: string | null }
) {
  const { app, connection, location } = await ready(deps, em)
  const items = await itemsToGet(em)
  const foods = [...new Set(items.map(foodOf))]
  const kept = new Map(
    (await em.find(StoreProduct, { store: KROGER, food: { $in: foods } })).map(
      (row) => [row.food, row]
    )
  )

  // Today's prices for what's kept.
  if (kept.size > 0) {
    const fresh = await productsById(deps.fetcher, app, {
      ids: [...kept.values()].map((row) => row.product.id),
      location,
    }).catch(() => [])
    const byId = new Map(fresh.map((product) => [product.id, product]))
    for (const row of kept.values()) {
      const now = byId.get(row.product.id)
      if (now) row.product = now
    }
    await recordPrices(em, who.householdId, fresh)
  }

  // Picks for the rest.
  const missing = foods.filter((food) => !kept.has(food))
  if (missing.length > 0) {
    const firsts = missing.map((food) =>
      items.find((item) => foodOf(item) === food)!
    )
    // The food as it's bought: something typed onto the list can still
    // say "Pinch of salt" or "chopped parsley".
    const named = firsts.map((item) => shoppingName(item.name))
    const results = await searchAll(deps, app, location, named)
    await recordPrices(em, who.householdId, results.flat())
    const asks = missing.map((food, i) => ({
      food,
      text: [amountOf(firsts[i]!), named[i]].filter(Boolean).join(" "),
      products: results[i] ?? [],
    }))
    const offered = asks.filter((ask) => ask.products.length > 0)
    const picks = await choose(deps, em, who, offered)
    offered.forEach((ask, i) => {
      const product = picks[i]
      if (!product) return
      kept.set(
        ask.food,
        em.create(StoreProduct, {
          household: who.householdId,
          store: KROGER,
          food: ask.food,
          product,
          chosen: false,
        })
      )
    })
  }
  await em.flush()
  const sales = await judgeSales(
    em,
    [...kept.values()].map((row) => row.product),
    await householdToday(em, who.householdId)
  )

  return {
    store: location.banner,
    location,
    modality: modalityOf(connection),
    linked: Boolean(connection.account && !connection.broken),
    sentAt: connection.lastSent?.at ?? null,
    lines: items.map((item) =>
      lineFor(item, kept.get(foodOf(item)), connection, sales)
    ),
  }
}

/** The store's products for some words, to pick another. */
export async function searchKroger(
  deps: BasketDeps,
  em: EntityManager,
  words: string
) {
  const { app, location } = await ready(deps, em)
  return searchProducts(deps.fetcher, app, { term: words, location, limit: 20 })
}

/**
 * The product a person picked for a thing on the list: kept for its food
 * from now on, and never replaced by itself.
 */
export async function pickKrogerProduct(
  deps: BasketDeps,
  em: EntityManager,
  options: { householdId: string; itemId: string; productId: string }
) {
  const { app, connection, location } = await ready(deps, em)
  const item = await em.findOne(ShoppingItem, { id: options.itemId })
  if (!item) {
    throw new AppError("not_found", "item_not_found", "That isn't on the list.")
  }
  const [product] = await productsById(deps.fetcher, app, {
    ids: [options.productId],
    location,
  })
  if (!product) {
    throw new AppError(
      "not_found",
      "kroger_product_not_found",
      "That product isn't at the household's store."
    )
  }
  const food = foodOf(item)
  const row =
    (await em.findOne(StoreProduct, { store: KROGER, food })) ??
    em.create(StoreProduct, {
      household: options.householdId,
      store: KROGER,
      food,
      product,
    })
  row.product = product
  row.chosen = true
  await em.flush()
  await recordPrices(em, options.householdId, [product])
  const sales = await judgeSales(
    em,
    [product],
    await householdToday(em, options.householdId)
  )
  return lineFor(item, row, connection, sales)
}

/**
 * Adds the lines ticked to the linked account's Kroger cart, by barcode,
 * so many of each. Their products are kept as the household's from now on.
 */
export async function sendKrogerBasket(
  deps: BasketDeps,
  em: EntityManager,
  lines: { itemId: string; packages: number }[]
) {
  const { connection, location } = await ready(deps, em)
  const items = await em.find(ShoppingItem, {
    id: { $in: lines.map((line) => line.itemId) },
  })
  const foods = new Map(items.map((item) => [item.id, foodOf(item)]))
  const kept = new Map(
    (
      await em.find(StoreProduct, {
        store: KROGER,
        food: { $in: [...foods.values()] },
      })
    ).map((row) => [row.food, row])
  )
  const byUpc = new Map<string, number>()
  const sent: Record<string, number> = {}
  for (const line of lines) {
    const food = foods.get(line.itemId)
    const row = food ? kept.get(food) : undefined
    const upc = row?.product.upc
    if (!row || !upc) continue
    byUpc.set(upc, (byUpc.get(upc) ?? 0) + line.packages)
    sent[line.itemId] = line.packages
    row.chosen = true
  }
  if (byUpc.size === 0) {
    throw new AppError(
      "invalid",
      "nothing_to_send",
      "None of those has a product to send."
    )
  }
  const token = await accountToken(deps, em, connection)
  await addToCart(
    deps.fetcher,
    token,
    [...byUpc].map(([upc, quantity]) => ({
      upc,
      quantity,
      modality: modalityOf(connection),
    }))
  )
  // Remember what went, while it's still on the list.
  const stillOn = new Set((await itemsToGet(em)).map((item) => item.id))
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
  return {
    sent: Object.keys(sent).length,
    store: location.banner,
    cartUrl: `https://www.${location.domain}/cart`,
  }
}

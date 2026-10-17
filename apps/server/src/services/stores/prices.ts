import {
  addDays,
  clockIn,
  DEFAULT_ON_HAND,
  guessAisle,
  judgeSale,
  lineFoods,
  onHandTest,
  worthIt,
  type AisleKey,
  type SaleJudged,
  type SaleLean,
  type SaleVerdict,
  type StoreProduct as Product,
} from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import type { AppDeps } from "../../core/context.ts"
import {
  Household,
  Recipe,
  RecipeIngredient,
  StoreConnection,
  StoreProduct,
} from "../../database/entities/index.ts"
import { ACROSS_HOUSEHOLDS } from "../../database/scope.ts"
import { STORE_SETTINGS } from "../../modules/stores/settings.ts"
import { enqueue } from "../jobs/jobs.ts"
import type { JobHandler } from "../jobs/runner.ts"
import { householdToday } from "../pantry/pantry.ts"
import { choose, ready, recordPrices, searchAll } from "./basket.ts"
import { KROGER, krogerConnection } from "./connections.ts"
import { priceHistory } from "./history.ts"
import { krogerApp, productsById } from "./kroger.ts"

// Prices, sales and deals at the household's Kroger store. Each morning
// in the household's time zone (and before its weekly autoplan) the
// products it keeps get today's prices, and the foods in its recipes are
// looked up a few at a time, so a sale on chicken thighs is seen even when
// they aren't on the list. Each sale is judged against what the product
// usually costs, and real deals sway Fill the week as much as the
// household says.

export type PriceDeps = Pick<AppDeps, "settings" | "fetcher" | "ai">

/** The check runs from this hour, in the household's time zone. */
const CHECK_HOUR = 5

/** Recipe foods looked up in one check. */
const SEARCHES_PER_CHECK = 50

/** A food with no product is looked for again after this long. */
const SEARCH_AGAIN_DAYS = 30

/** Merran's own pick that isn't on sale is looked at again for one that is. */
const RECHECK_DAYS = 7

/** A price older than this isn't trusted to still be a sale. */
const FRESH_DAYS = 8

/** Where a sale changes what's for dinner. */
const SALE_AISLES = new Set<AisleKey>(["meat-seafood", "produce"])

type RecipeFood = { key: string; name: string; aisle: AisleKey }

/**
 * The foods in the household's recipes: each recipe's, as it names them,
 * and every food once with its aisle and how many recipes use it.
 */
export async function recipeFoods(em: EntityManager) {
  const recipes = await em.find(Recipe, {}, { fields: ["id"] })
  const lines =
    recipes.length === 0
      ? []
      : await em.find(
          RecipeIngredient,
          { recipe: { $in: recipes.map((recipe) => recipe.id) } },
          { fields: ["recipe", "rawText"] }
        )
  const byRecipe = new Map<string, RecipeFood[]>()
  const foods = new Map<string, RecipeFood & { recipes: number }>()
  for (const line of lines) {
    for (const food of lineFoods(line.rawText)) {
      const mine = byRecipe.get(line.recipe.id) ?? []
      if (mine.some((one) => one.key === food.key)) continue
      const found = {
        name: food.name,
        key: food.key,
        aisle: guessAisle(food.name),
      }
      mine.push(found)
      byRecipe.set(line.recipe.id, mine)
      const counted = foods.get(food.key)
      if (counted) counted.recipes++
      else foods.set(food.key, { ...found, recipes: 1 })
    }
  }
  return { byRecipe, foods }
}

export type Deal = SaleJudged & {
  /** The food, as Merran matches it: "chicken thigh". */
  food: string
  product: Product
  aisle: AisleKey
}

/**
 * What's on sale at the household's store now, by food: the products it
 * keeps, seen in the past week, with a sale that hasn't ended.
 */
export async function currentDeals(em: EntityManager, today: string) {
  const rows = await em.find(StoreProduct, { store: KROGER })
  const deals = new Map<string, Deal>()
  const onSale = rows.filter((row) => row.product.salePrice !== null)
  if (onSale.length === 0) return deals
  const history = await priceHistory(
    em,
    onSale.map((row) => row.product.id),
    today
  )
  const from = addDays(today, -FRESH_DAYS)
  for (const row of onSale) {
    const seen = history.get(row.product.id) ?? []
    // Not seen lately: the sale may be long over.
    if (!seen.some((one) => one.day >= from)) continue
    const judged = judgeSale(row.product, seen, today)
    if (!judged) continue
    deals.set(row.food, {
      ...judged,
      food: row.food,
      product: row.product,
      aisle: guessAisle(row.food),
    })
  }
  return deals
}

export type RecipeSale = {
  /** As the recipe names it: "chicken thighs". */
  name: string
  key: string
  aisle: AisleKey
  verdict: SaleVerdict
}

/** What each recipe uses that's on sale, by recipe id. */
export function recipeSales(
  byRecipe: Map<string, RecipeFood[]>,
  deals: Map<string, Deal>
) {
  const sales = new Map<string, RecipeSale[]>()
  if (deals.size === 0) return sales
  for (const [recipeId, foods] of byRecipe) {
    const onSale = foods.flatMap((food) => {
      const deal = deals.get(food.key)
      return deal ? [{ ...food, verdict: deal.verdict }] : []
    })
    if (onSale.length > 0) sales.set(recipeId, onSale)
  }
  return sales
}

/** The recipes that use a real deal at the household's store. */
export async function recipesOnSale(em: EntityManager, householdId: string) {
  const deals = await currentDeals(em, await householdToday(em, householdId))
  if (deals.size === 0) return []
  const { byRecipe } = await recipeFoods(em)
  return [...recipeSales(byRecipe, deals)]
    .filter(([, sales]) => sales.some((sale) => worthIt(sale.verdict)))
    .map(([id]) => id)
}

/** What the suggester needs of sales: how much to lean, and each recipe's. */
export type SuggestSales = {
  lean: SaleLean
  recipes: Map<string, RecipeSale[]>
}

/**
 * Sales for Fill the week and the autoplan, or null when they don't count:
 * Kroger isn't set up, the household leans on them not at all, or nothing
 * it cooks with is on sale.
 */
export async function salesForSuggest(
  deps: Pick<AppDeps, "settings">,
  em: EntityManager,
  householdId: string
): Promise<SuggestSales | null> {
  if (!(await krogerApp(deps.settings))) return null
  const lean = await deps.settings.household(
    em,
    householdId,
    STORE_SETTINGS.leanOnSales
  )
  if (lean === "off") return null
  const deals = await currentDeals(em, await householdToday(em, householdId))
  if (![...deals.values()].some((deal) => worthIt(deal.verdict))) return null
  const { byRecipe } = await recipeFoods(em)
  return { lean, recipes: recipeSales(byRecipe, deals) }
}

/** The household's deals and the recipes they're in, as the app shows them. */
export async function listDeals(
  deps: Pick<AppDeps, "settings">,
  em: EntityManager,
  householdId: string
) {
  const connection = await krogerConnection(em)
  const today = await householdToday(em, householdId)
  const deals = await currentDeals(em, today)
  const sales =
    deals.size === 0
      ? new Map<string, RecipeSale[]>()
      : recipeSales((await recipeFoods(em)).byRecipe, deals)
  return {
    store: connection?.location?.banner ?? null,
    checkedAt: connection?.pricesCheckedAt?.toISOString() ?? null,
    leanOnSales: await deps.settings.household(
      em,
      householdId,
      STORE_SETTINGS.leanOnSales
    ),
    deals: [...deals.values()]
      .sort(
        (a, b) =>
          Number(b.verdict === "lowest") - Number(a.verdict === "lowest") ||
          Number(worthIt(b.verdict)) - Number(worthIt(a.verdict)) ||
          b.off - a.off
      )
      .map((deal) => ({
        food: deal.food,
        product: deal.product,
        verdict: deal.verdict,
        usual: deal.usual,
        off: Math.round(deal.off * 100) / 100,
      })),
    recipes: Object.fromEntries(
      [...sales].map(([id, onSale]) => [
        id,
        onSale.map((sale) => ({ name: sale.name, verdict: sale.verdict })),
      ])
    ),
  }
}

export type PriceCheck = {
  /** Kept products given today's price. */
  refreshed: number
  /** Recipe foods looked up at the store. */
  searched: number
  /** Foods in the household's recipes that are a deal now. */
  deals: number
}

/**
 * Checks the household's prices: today's for every product it keeps, and
 * a look at the store for the foods its recipes use, the most used first:
 * those with no product yet (meat, seafood and produce before the rest),
 * then Merran's own picks of those not on sale, for one that is. A product
 * someone picked is never swapped, and food that's always at home isn't
 * looked for.
 */
export async function checkPrices(
  deps: PriceDeps,
  em: EntityManager,
  householdId: string
): Promise<PriceCheck> {
  const { app, connection, location } = await ready(deps, em)
  const today = await householdToday(em, householdId)
  const kept = await em.find(StoreProduct, { store: KROGER })
  const byFood = new Map(kept.map((row) => [row.food, row]))

  const fresh = await productsById(deps.fetcher, app, {
    ids: [...new Set(kept.map((row) => row.product.id))],
    location,
  })
  const byId = new Map(fresh.map((product) => [product.id, product]))
  const searchedOn = { ...connection.priceSearches }
  let refreshed = 0
  for (const row of kept) {
    const now = byId.get(row.product.id)
    if (now) {
      row.product = now
      refreshed++
    } else if (!row.chosen) {
      // Merran's pick that the store doesn't carry now, or that isn't food
      // (a lipstick called Tomato Girl): looked for again.
      em.remove(row)
      byFood.delete(row.food)
      delete searchedOn[row.food]
    }
  }
  await recordPrices(em, householdId, fresh)

  const lately = (key: string, days: number) =>
    (searchedOn[key] ?? "") > addDays(today, -days)
  const household = await em.findOneOrFail(Household, { id: householdId })
  const atHome = onHandTest(household.settings?.alwaysOnHand ?? DEFAULT_ON_HAND)
  const { foods } = await recipeFoods(em)
  const forSales = (food: RecipeFood) => SALE_AISLES.has(food.aisle)
  const mostUsed = [...foods.values()]
    .filter((food) => !atHome(food.name))
    .sort(
      (a, b) =>
        Number(forSales(b)) - Number(forSales(a)) || b.recipes - a.recipes
    )
  const lookup = [
    ...mostUsed.filter(
      (food) => !byFood.has(food.key) && !lately(food.key, SEARCH_AGAIN_DAYS)
    ),
    ...mostUsed.filter(forSales).filter((food) => {
      const row = byFood.get(food.key)
      return (
        row &&
        !row.chosen &&
        row.product.salePrice === null &&
        !lately(food.key, RECHECK_DAYS)
      )
    }),
  ].slice(0, SEARCHES_PER_CHECK)

  if (lookup.length > 0) {
    const results = await searchAll(
      deps,
      app,
      location,
      lookup.map((food) => food.name)
    )
    await recordPrices(em, householdId, results.flat())
    const asks = lookup.map((food, i) => ({
      food,
      text: food.name,
      products: results[i] ?? [],
    }))
    const offered = asks.filter((ask) => ask.products.length > 0)
    const picks = await choose(deps, em, { householdId, userId: null }, offered)
    for (const ask of asks) searchedOn[ask.food.key] = today
    offered.forEach((ask, i) => {
      const product = picks[i]
      if (!product) return
      const row = byFood.get(ask.food.key)
      if (!row) {
        byFood.set(
          ask.food.key,
          em.create(StoreProduct, {
            household: householdId,
            store: KROGER,
            food: ask.food.key,
            product,
            chosen: false,
          })
        )
      } else if (!row.chosen) row.product = product
    })
  }

  connection.priceSearches = searchedOn
  connection.pricesCheckedAt = new Date()
  await em.flush()
  const deals = await currentDeals(em, today)
  return {
    refreshed,
    searched: lookup.length,
    deals: [...deals.values()].filter(
      (deal) => foods.has(deal.food) && worthIt(deal.verdict)
    ).length,
  }
}

/** A household's check is due: not yet today, and it's morning there. */
export function priceCheckDue(
  checkedAt: Date | null,
  timeZone: string,
  now = new Date()
) {
  const clock = clockIn(timeZone, now)
  if (clock.hour < CHECK_HOUR) return false
  return !checkedAt || clockIn(timeZone, checkedAt).today !== clock.today
}

/**
 * Today's prices before planning, if they haven't been checked today:
 * the autoplan's suggestions then see this week's sales. A check that
 * fails doesn't stop the plan.
 */
export async function freshPrices(
  deps: PriceDeps,
  em: EntityManager,
  householdId: string
) {
  if (!(await krogerApp(deps.settings))) return
  const connection = await krogerConnection(em)
  if (!connection?.location) return
  const household = await em.findOneOrFail(Household, { id: householdId })
  const checked = connection.pricesCheckedAt
  if (
    checked &&
    clockIn(household.timeZone, checked).today ===
      clockIn(household.timeZone).today
  ) {
    return
  }
  await checkPrices(deps, em, householdId).catch(() => undefined)
}

export const CHECK_PRICES = "stores.prices"

/** Asks for a household's check soon, as when it picks its store. */
export async function checkPricesSoon(em: EntityManager, householdId: string) {
  await enqueue(em, {
    kind: CHECK_PRICES,
    householdId,
    key: `${CHECK_PRICES}:${householdId}`,
    maxAttempts: 1,
  })
}

/**
 * Every half hour: each household whose check is due gets a job of its
 * own, which checks it.
 */
export const checkPricesJob: JobHandler = {
  kind: CHECK_PRICES,
  concurrency: 2,
  async run({ em, householdId, deps, logger }) {
    if (!(await krogerApp(deps.settings))) return { skipped: "no Kroger app" }
    if (householdId) {
      if (!(await krogerConnection(em))?.location) {
        return { skipped: "no store" }
      }
      const check = await checkPrices(deps, em, householdId)
      logger.info(check, "Checked the store's prices")
      return { ...check }
    }
    const connections = await em.find(
      StoreConnection,
      { store: KROGER, location: { $ne: null } },
      { ...ACROSS_HOUSEHOLDS, populate: ["household"] }
    )
    let due = 0
    for (const connection of connections) {
      const household = connection.household.getEntity()
      if (
        !priceCheckDue(connection.pricesCheckedAt ?? null, household.timeZone)
      ) {
        continue
      }
      await checkPricesSoon(em, household.id)
      due++
    }
    return { due }
  },
}

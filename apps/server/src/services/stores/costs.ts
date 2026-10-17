import {
  costFor,
  costShown,
  daysBetween,
  DEFAULT_ON_HAND,
  onHandTest,
  recipeCost,
  type RecipeCost,
} from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import type { AppDeps } from "../../core/context.ts"
import {
  Household,
  PlanEntry,
  Recipe,
  RecipeIngredient,
  StoreProduct,
} from "../../database/entities/index.ts"
import { STORE_SETTINGS } from "../../modules/stores/settings.ts"
import { householdToday } from "../pantry/pantry.ts"
import { toNumber } from "../recipes/recipes.ts"
import { KROGER } from "./connections.ts"
import { krogerApp } from "./kroger.ts"

// What recipes cost at the household's Kroger store, from the products it
// keeps for each food and today's prices, and the weekly budget Fill the
// week keeps to.

type Costed = { cost: RecipeCost; servings: number | null }

/** Each recipe's cost, by id, as far as its lines have prices. */
export async function recipeCosts(
  em: EntityManager,
  householdId: string
): Promise<Map<string, Costed>> {
  const costs = new Map<string, Costed>()
  const products = await em.find(StoreProduct, { store: KROGER })
  if (products.length === 0) return costs
  const byFood = new Map(products.map((row) => [row.food, row.product]))
  const recipes = await em.find(Recipe, {}, { fields: ["id", "servings"] })
  if (recipes.length === 0) return costs
  const lines = new Map<string, string[]>()
  for (const line of await em.find(
    RecipeIngredient,
    { recipe: { $in: recipes.map((recipe) => recipe.id) } },
    { fields: ["recipe", "rawText"], orderBy: { position: "asc" } }
  )) {
    const list = lines.get(line.recipe.id)
    if (list) list.push(line.rawText)
    else lines.set(line.recipe.id, [line.rawText])
  }
  const household = await em.findOneOrFail(Household, { id: householdId })
  const isOnHand = onHandTest(
    household.settings?.alwaysOnHand ?? DEFAULT_ON_HAND
  )
  const today = await householdToday(em, householdId)
  for (const recipe of recipes) {
    costs.set(recipe.id, {
      cost: recipeCost(lines.get(recipe.id) ?? [], (food) => byFood.get(food), {
        today,
        isOnHand,
      }),
      servings: toNumber(recipe.servings),
    })
  }
  return costs
}

/** The costs worth showing, and the budget, as the app shows them. */
export async function listCosts(
  deps: Pick<AppDeps, "settings">,
  em: EntityManager,
  householdId: string
) {
  const weeklyBudget = await deps.settings.household(
    em,
    householdId,
    STORE_SETTINGS.weeklyBudget
  )
  const recipes: Record<
    string,
    {
      total: number
      perServing: number | null
      priced: number
      counted: number
    }
  > = {}
  let currency: string | null = null
  if (await krogerApp(deps.settings)) {
    for (const [id, { cost, servings }] of await recipeCosts(em, householdId)) {
      if (!costShown(cost)) continue
      currency ??= cost.currency
      recipes[id] = {
        total: cost.total,
        perServing: servings ? Math.round(cost.total / servings) : null,
        priced: cost.priced,
        counted: cost.counted,
      }
    }
  }
  return {
    currency: currency ?? "USD",
    weeklyBudget: weeklyBudget === null ? null : Math.round(weeklyBudget * 100),
    recipes,
  }
}

/** What Fill the week needs of the budget: what each meal can cost. */
export type SuggestBudget = {
  /** What's left of the budget for each meal still to plan, in cents. */
  perMeal: number
  /** Each recipe's cost, in cents, where it's shown. */
  costOf: Map<string, number>
}

/**
 * The budget for meals still to plan, or null without one (or without
 * costs): the days' share of the weekly budget, less what's planned for
 * them already, spread over the meals to plan.
 */
export async function budgetForSuggest(
  deps: Pick<AppDeps, "settings">,
  em: EntityManager,
  householdId: string,
  slots: readonly { date: string }[]
): Promise<SuggestBudget | null> {
  if (slots.length === 0 || !(await krogerApp(deps.settings))) return null
  const weekly = await deps.settings.household(
    em,
    householdId,
    STORE_SETTINGS.weeklyBudget
  )
  if (weekly === null) return null
  const costs = await recipeCosts(em, householdId)
  const costOf = new Map<string, number>()
  for (const [id, { cost }] of costs) {
    if (costShown(cost)) costOf.set(id, cost.total)
  }
  if (costOf.size === 0) return null

  const dates = slots.map((slot) => slot.date).sort()
  const from = dates[0]!
  const to = dates.at(-1)!
  const planned = await em.find(PlanEntry, {
    date: { $gte: from, $lte: to },
    status: { $ne: "skipped" },
    recipe: { $ne: null },
  })
  const spent = planned.reduce((sum, entry) => {
    const recipe = costs.get(entry.recipe!.id)
    const total = recipe && costShown(recipe.cost) ? recipe.cost.total : null
    return total === null
      ? sum
      : sum + costFor(total, toNumber(entry.servings), recipe!.servings)
  }, 0)
  const days = daysBetween(from, to) + 1
  return {
    perMeal: Math.max(0, (weekly * 100 * days) / 7 - spent) / slots.length,
    costOf,
  }
}

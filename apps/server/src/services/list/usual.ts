import {
  addDays,
  DEFAULT_ON_HAND,
  foodKey,
  onHandTest,
  readAmount,
  usualBuys,
} from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import {
  Household,
  PantryItem,
  Purchase,
  ShoppingItem,
  WeeklyItem,
} from "../../database/entities/index.ts"
import { householdToday } from "../pantry/pantry.ts"
import { toNumber } from "../recipes/recipes.ts"
import { aislesOf } from "./aisles.ts"
import { describeItems } from "./list.ts"
import { listsOf } from "./lists.ts"
import { householdKeys } from "./food-aliases.ts"

// Usual buys: what the household gets every so often, learned from the
// shopping it's put away, offered when it's due again. Not what's on the
// list, at home, bought every week or always on hand, nor what's been
// passed over until it's due again.

/** What the household usually buys, from everything it's put away. */
async function allUsualBuys(em: EntityManager) {
  const purchases = await em.find(
    Purchase,
    {},
    { orderBy: { boughtOn: "asc", createdAt: "asc" } }
  )
  return usualBuys(
    purchases.map((purchase) => ({
      food: purchase.foodKey,
      name: purchase.name,
      boughtOn: purchase.boughtOn,
      quantity: toNumber(purchase.quantity),
      unit: purchase.unit ?? null,
      amountText: purchase.amountText ?? null,
    }))
  )
}

/** The usual buys due now, most overdue first. */
export async function dueUsualBuys(em: EntityManager, householdId: string) {
  const keyOf = await householdKeys(em)
  const [usual, today, household] = await Promise.all([
    allUsualBuys(em),
    householdToday(em, householdId),
    em.findOneOrFail(Household, { id: householdId }),
  ])
  if (usual.length === 0) return []
  const [onList, atHome, weekly] = await Promise.all([
    em.find(ShoppingItem, { checked: false }),
    em.find(PantryItem, {}),
    em.find(WeeklyItem, {}),
  ])
  const have = new Set([
    ...onList.map((item) => keyOf(item.name)),
    ...atHome.map((item) => item.foodKey),
    ...weekly.map((item) => keyOf(item.name)),
  ])
  const isOnHand = onHandTest(
    household.settings?.alwaysOnHand ?? DEFAULT_ON_HAND
  )
  const skipped = household.settings?.usualSkipped ?? {}
  return usual.filter(
    (buy) =>
      buy.dueOn <= today &&
      !have.has(buy.food) &&
      !isOnHand(buy.name) &&
      !((skipped[buy.food] ?? "") > today)
  )
}

/** Not this time: a usual buy isn't offered again until it's next due. */
export async function skipUsualBuy(
  em: EntityManager,
  householdId: string,
  food: string
) {
  const [usual, today] = await Promise.all([
    allUsualBuys(em),
    householdToday(em, householdId),
  ])
  const buy = usual.find((found) => found.food === food)
  const household = await em.findOneOrFail(Household, { id: householdId })
  const skipped = Object.fromEntries(
    // Ones whose time has come are forgotten.
    Object.entries(household.settings?.usualSkipped ?? {}).filter(
      ([, until]) => until > today
    )
  )
  skipped[food] = addDays(today, buy?.every ?? 7)
  household.settings = { ...household.settings, usualSkipped: skipped }
  await em.flush()
}

/**
 * Usual buys onto the list, as they were last bought, each in its aisle
 * and on its list. Ones not due are passed over.
 */
export async function addUsualBuys(
  em: EntityManager,
  householdId: string,
  foods: readonly string[]
) {
  const keyOf = await householdKeys(em)
  const due = (await dueUsualBuys(em, householdId)).filter((buy) =>
    foods.includes(buy.food)
  )
  if (due.length === 0) return []
  const aisles = await aislesOf(em, householdId, due)
  const lists = await listsOf(
    em,
    householdId,
    due.map((buy, index) => ({ name: buy.name, aisle: aisles[index] }))
  )
  const added = due.map((buy, index) =>
    em.create(ShoppingItem, {
      household: householdId,
      list: lists[index]!,
      foodKey: keyOf(buy.name),
      name: buy.name,
      ...readAmount(buy.amount),
      aisle: aisles[index] ?? null,
      source: "usual",
    })
  )
  await em.flush()
  return describeItems(em, added)
}

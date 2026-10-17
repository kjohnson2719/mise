import { DEFAULT_ON_HAND, tidyOnHand } from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { AppError } from "../../core/errors.ts"
import { Household, WeeklyItem } from "../../database/entities/index.ts"
import { aislesOf } from "./aisles.ts"

// What the household buys every week whatever's planned (bananas, Diet
// Pepsi), and what it always has, which lists made from the plan leave off.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function describeWeekly(item: WeeklyItem) {
  return {
    id: item.id,
    name: item.name,
    amount: item.amountText ?? null,
    aisle: item.aisle?.id ?? null,
  }
}

export async function listEveryWeek(em: EntityManager) {
  const items = await em.find(
    WeeklyItem,
    {},
    { orderBy: { position: "asc", id: "asc" } }
  )
  return items.map(describeWeekly)
}

async function findWeekly(em: EntityManager, id: string) {
  const item = UUID.test(id) ? await em.findOne(WeeklyItem, { id }) : null
  if (!item) {
    throw new AppError(
      "not_found",
      "every_week_item_not_found",
      "That isn't on the every-week list."
    )
  }
  return item
}

export async function addEveryWeekItem(
  em: EntityManager,
  householdId: string,
  input: { name: string; amount?: string | null }
) {
  const name = input.name.trim()
  const [aisle] = await aislesOf(em, householdId, [{ name }])
  const last = await em.findOne(
    WeeklyItem,
    {},
    { orderBy: { position: "desc" } }
  )
  const item = em.create(WeeklyItem, {
    household: householdId,
    name,
    amountText: input.amount?.trim() || null,
    aisle: aisle ?? null,
    position: (last?.position ?? -1) + 1,
  })
  await em.flush()
  return describeWeekly(item)
}

export async function updateEveryWeekItem(
  em: EntityManager,
  id: string,
  changes: { name?: string; amount?: string | null }
) {
  const item = await findWeekly(em, id)
  if (changes.name !== undefined) item.name = changes.name.trim()
  if (changes.amount !== undefined)
    item.amountText = changes.amount?.trim() || null
  await em.flush()
  return describeWeekly(item)
}

export async function removeEveryWeekItem(em: EntityManager, id: string) {
  em.remove(await findWeekly(em, id))
  await em.flush()
}

/** What the household always has: salt, pepper, water and ice to start. */
export async function getOnHand(em: EntityManager, householdId: string) {
  const household = await em.findOneOrFail(Household, { id: householdId })
  return household.settings?.alwaysOnHand ?? DEFAULT_ON_HAND
}

/** Saves what's always on hand, tidied: "Salt and pepper" is salt and pepper. */
export async function saveOnHand(
  em: EntityManager,
  householdId: string,
  names: readonly string[]
) {
  const household = await em.findOneOrFail(Household, { id: householdId })
  const alwaysOnHand = tidyOnHand(names)
  household.settings = { ...household.settings, alwaysOnHand }
  await em.flush()
  return alwaysOnHand
}

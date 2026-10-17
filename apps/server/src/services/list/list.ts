import {
  foodKey,
  formatAmount,
  readAmount,
  readItem,
  type MealShare,
} from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { AppError } from "../../core/errors.ts"
import {
  Aisle,
  ITEM_SOURCES,
  PlanEntry,
  ShoppingItem,
  ShoppingList,
  WeeklyItem,
} from "../../database/entities/index.ts"
import { HOUSEHOLD_FILTER, NOT_DELETED_FILTER } from "../../database/scope.ts"
import { householdKeys } from "./food-aliases.ts"
import { inHouseholdTransaction, toNumber } from "../recipes/recipes.ts"
import {
  aislesOf,
  describeAisle,
  findAisle,
  householdAisles,
  rememberAisle,
} from "./aisles.ts"
import {
  describeList,
  findList,
  householdLists,
  listsOf,
  mainList,
  rememberList,
} from "./lists.ts"
import { relistRestored, unlistRemoved } from "./meals.ts"

// The shopping lists: what to buy, by aisle, on the list for the store
// it's bought at. Things go on from the plan (added up), typed in, or
// every week. Checking something off keeps it until the list is cleared.

export type ItemSource = (typeof ITEM_SOURCES)[number]

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The planned meals items are for: their names, by id. */
async function mealNames(em: EntityManager, items: readonly ShoppingItem[]) {
  const ids = [
    ...new Set(
      items.flatMap((item) => (item.forMeals ?? []).map((share) => share.meal))
    ),
  ]
  if (ids.length === 0) return new Map<string, string>()
  const entries = await em.find(
    PlanEntry,
    { id: { $in: ids } },
    {
      populate: ["recipe"],
      filters: { [NOT_DELETED_FILTER]: false },
    }
  )
  return new Map(
    entries.map((entry) => [
      entry.id,
      entry.recipe?.getEntity().name ?? entry.note ?? "",
    ])
  )
}

/** An item as the API shows it. */
function describeItem(item: ShoppingItem, names: Map<string, string>) {
  const quantity = toNumber(item.quantity)
  return {
    id: item.id,
    list: item.list.id,
    name: item.name,
    amount: item.amountText ?? formatAmount(quantity, item.unit ?? null),
    quantity,
    unit: item.unit ?? null,
    amountText: item.amountText ?? null,
    aisle: item.aisle?.id ?? null,
    checked: item.checked,
    source: item.source,
    // Each meal once, though it may have a share from its side too.
    meals: [...new Set((item.forMeals ?? []).map((share) => share.meal))]
      .filter((id) => names.has(id))
      .map((id) => ({ id, name: names.get(id)! })),
    createdAt: item.createdAt.toISOString(),
  }
}

export type DescribedItem = ReturnType<typeof describeItem>

export async function describeItems(
  em: EntityManager,
  items: readonly ShoppingItem[]
) {
  const names = await mealNames(em, items)
  return items.map((item) => describeItem(item, names))
}

/** An item as it was, to put it back as it was (Undo). */
export function itemSnapshot(item: ShoppingItem) {
  return {
    id: item.id,
    list: item.list.id,
    name: item.name,
    foodKey: item.foodKey ?? null,
    quantity: toNumber(item.quantity),
    unit: item.unit ?? null,
    amountText: item.amountText ?? null,
    aisle: item.aisle?.id ?? null,
    checked: item.checked,
    source: item.source,
    forMeals: item.forMeals ?? null,
    createdAt: item.createdAt.toISOString(),
  }
}

export type ItemSnapshot = ReturnType<typeof itemSnapshot>

/**
 * The household's lists, the main one first; its aisles in walking order;
 * and everything on the lists, by aisle.
 */
export async function getList(em: EntityManager, householdId: string) {
  const lists = await householdLists(em, householdId)
  const aisles = await householdAisles(em, householdId)
  const items = await em.find(
    ShoppingItem,
    {},
    { orderBy: { createdAt: "asc", id: "asc" } }
  )
  const order = new Map(aisles.map((aisle) => [aisle.id, aisle.position]))
  const last = aisles.length
  const sorted = [...items].sort(
    (a, b) =>
      (order.get(a.aisle?.id ?? "") ?? last) -
      (order.get(b.aisle?.id ?? "") ?? last)
  )
  return {
    lists: lists.map(describeList),
    aisles: aisles.map(describeAisle),
    items: await describeItems(em, sorted),
  }
}

export async function findItem(em: EntityManager, id: string) {
  const item = UUID.test(id) ? await em.findOne(ShoppingItem, { id }) : null
  if (!item) {
    throw new AppError(
      "not_found",
      "list_item_not_found",
      "That isn't on the list."
    )
  }
  return item
}

/**
 * Something typed in: "2 lb ground beef" or "paper towels". It goes on the
 * list given, else where its food goes.
 */
export async function addTyped(
  em: EntityManager,
  householdId: string,
  input: { text: string; aisle?: string | null; list?: string | null }
) {
  const keyOf = await householdKeys(em)
  const { name, quantity, unit } = readItem(input.text)
  if (!name) {
    throw new AppError("invalid", "invalid_item", "Say what to add.", {
      text: "Say what to add.",
    })
  }
  const aisle = input.aisle
    ? await findAisle(em, input.aisle)
    : (await aislesOf(em, householdId, [{ name, unit }]))[0]!
  const list = input.list
    ? await findList(em, input.list)
    : (await listsOf(em, householdId, [{ name, aisle }]))[0]!
  const item = em.create(ShoppingItem, {
    household: householdId,
    list,
    foodKey: keyOf(name),
    name,
    quantity,
    unit,
    aisle,
    source: "typed",
  })
  await em.flush()
  return (await describeItems(em, [item]))[0]!
}

export type ItemChanges = Partial<{
  name: string
  /** As typed: "2 lb", "half a bag", or empty for none. */
  amount: string
  checked: boolean
  /** An aisle's id, remembered for the food next time; null for none. */
  aisle: string | null
  /** A list's id, remembered for the food next time. */
  list: string
}>

function check(item: ShoppingItem, checked: boolean) {
  if (item.checked === checked) return
  item.checked = checked
  item.checkedAt = checked ? new Date() : null
}

export async function updateItem(
  em: EntityManager,
  householdId: string,
  id: string,
  changes: ItemChanges
) {
  const keyOf = await householdKeys(em)
  const item = await findItem(em, id)
  if (changes.name !== undefined) {
    item.name = changes.name.trim()
    item.foodKey = keyOf(item.name)
  }
  if (changes.amount !== undefined) em.assign(item, readAmount(changes.amount))
  if (changes.checked !== undefined) check(item, changes.checked)
  if (changes.aisle !== undefined) {
    const aisle = changes.aisle ? await findAisle(em, changes.aisle) : null
    item.aisle = aisle
      ? em.getReference(Aisle, aisle.id, { wrapped: true })
      : null
    await rememberAisle(em, householdId, [item.name], aisle)
  }
  if (changes.list !== undefined) {
    const list = await findList(em, changes.list)
    item.list = em.getReference(ShoppingList, list.id, { wrapped: true })
    await rememberList(em, householdId, [item.name], list)
  }
  await em.flush()
  return (await describeItems(em, [item]))[0]!
}

export async function removeItem(em: EntityManager, id: string) {
  const item = await findItem(em, id)
  const before = itemSnapshot(item)
  em.remove(item)
  await em.flush()
  await unlistRemoved(em, [item])
  return before
}

export type ItemBulk =
  | { action: "remove" | "check" | "uncheck" | "every-week" }
  | { action: "aisle"; aisle: string | null }
  | { action: "move"; list: string }

/**
 * Several items at once, all or none: taken off, checked or not, moved to
 * an aisle or another list (remembered, as moving one is), or bought
 * every week. The answer says what they were before, for Undo. Ids not on
 * the list are passed over.
 */
export async function bulkItems(
  em: EntityManager,
  householdId: string,
  ids: readonly string[],
  bulk: ItemBulk
) {
  return inHouseholdTransaction(em, householdId, async (tx) => {
    const items = await tx.find(ShoppingItem, {
      id: { $in: ids.filter((id) => UUID.test(id)) },
    })
    const before = items.map(itemSnapshot)
    switch (bulk.action) {
      case "remove":
        for (const item of items) tx.remove(item)
        await tx.flush()
        await unlistRemoved(tx, items)
        break
      case "check":
      case "uncheck":
        for (const item of items) check(item, bulk.action === "check")
        break
      case "aisle": {
        const aisle = bulk.aisle ? await findAisle(tx, bulk.aisle) : null
        for (const item of items)
          item.aisle = aisle
            ? tx.getReference(Aisle, aisle.id, { wrapped: true })
            : null
        await rememberAisle(
          tx,
          householdId,
          items.map((item) => item.name),
          aisle
        )
        break
      }
      case "move": {
        const list = await findList(tx, bulk.list)
        for (const item of items)
          item.list = tx.getReference(ShoppingList, list.id, { wrapped: true })
        await rememberList(
          tx,
          householdId,
          items.map((item) => item.name),
          list
        )
        break
      }
      case "every-week":
        await makeEveryWeek(tx, householdId, items)
        break
    }
    await tx.flush()
    return { changed: items.length, before }
  })
}

/**
 * Items to buy every week from now on. One every-week item a food; typed
 * ones become this week's every-week line, so adding the every-week items
 * doesn't put them on twice.
 */
async function makeEveryWeek(
  em: EntityManager,
  householdId: string,
  items: readonly ShoppingItem[]
) {
  const keyOf = await householdKeys(em)
  const weekly = await em.find(WeeklyItem, {})
  const main = await mainList(em, householdId)
  const have = new Set(weekly.map((item) => keyOf(item.name)))
  let position = Math.max(-1, ...weekly.map((item) => item.position)) + 1
  for (const item of items) {
    const key = keyOf(item.name)
    if (!have.has(key)) {
      have.add(key)
      const amount = describeItem(item, new Map()).amount
      em.create(WeeklyItem, {
        household: householdId,
        name: item.name,
        amountText: amount || null,
        aisle: item.aisle ?? null,
        // Bought where it's bought now, unless that's anywhere.
        list: item.list.id === main.id ? null : item.list,
        position: position++,
      })
    }
    if (item.source === "typed") item.source = "every-week"
  }
}

/** Takes checked items off the list, or everything. Says what they were, for Undo. */
export async function clearList(
  em: EntityManager,
  householdId: string,
  which: "checked" | "all"
) {
  return inHouseholdTransaction(em, householdId, async (tx) => {
    const items = await tx.find(
      ShoppingItem,
      which === "checked" ? { checked: true } : {}
    )
    const before = items.map(itemSnapshot)
    for (const item of items) tx.remove(item)
    await tx.flush()
    await unlistRemoved(tx, items)
    return { before }
  })
}

/**
 * Puts items back as they were (Undo). An id another household has can't
 * come back here; an aisle that's gone is left empty, and a list that's
 * gone is the main list.
 */
export async function restoreItems(
  em: EntityManager,
  householdId: string,
  snapshots: readonly ItemSnapshot[]
) {
  const keyOf = await householdKeys(em)
  return inHouseholdTransaction(em, householdId, async (tx) => {
    const lists = await householdLists(tx, householdId)
    const listOf = (id: string) =>
      lists.find((list) => list.id === id) ?? lists[0]!
    const aisles = new Map(
      (await householdAisles(tx, householdId)).map((aisle) => [aisle.id, aisle])
    )
    const restored: ShoppingItem[] = []
    for (const snapshot of snapshots) {
      if (!UUID.test(snapshot.id)) continue
      let item = await tx.findOne(ShoppingItem, { id: snapshot.id })
      if (!item) {
        const elsewhere = await tx.count(
          ShoppingItem,
          { id: snapshot.id },
          { filters: { [HOUSEHOLD_FILTER]: false } }
        )
        if (elsewhere > 0) continue
        item = tx.create(ShoppingItem, {
          id: snapshot.id,
          household: householdId,
          list: listOf(snapshot.list),
          name: snapshot.name,
          source: snapshot.source,
          createdAt: new Date(snapshot.createdAt),
        })
      }
      const aisle = snapshot.aisle ? aisles.get(snapshot.aisle) : undefined
      tx.assign(item, {
        list: listOf(snapshot.list),
        name: snapshot.name,
        foodKey: snapshot.foodKey ?? keyOf(snapshot.name),
        quantity: snapshot.quantity,
        unit: snapshot.unit,
        amountText: snapshot.amountText,
        aisle: aisle ?? null,
        source: snapshot.source,
        forMeals: snapshot.forMeals as MealShare[] | null,
      })
      check(item, snapshot.checked)
      restored.push(item)
    }
    await tx.flush()
    await relistRestored(tx, restored)
    return describeItems(tx, restored)
  })
}

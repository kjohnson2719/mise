import { foodKey } from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { AppError } from "../../core/errors.ts"
import {
  Aisle,
  FoodPlacement,
  ShoppingItem,
  ShoppingList,
} from "../../database/entities/index.ts"
import { inHouseholdTransaction } from "../recipes/recipes.ts"
import { householdKeys } from "./food-aliases.ts"

// A household's lists, for however it likes to sort what it buys (the
// corner shop, a festival, the big monthly shop). Things go on the main
// list unless the household moved that food to another list before, or
// its aisle goes on another list. Stores are chosen for each thing, when
// it's found or sent (docs/platform.md, Stores).

/** The most lists a household can have. */
export const MAX_LISTS = 10

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The household's main list, which takes anything not sent elsewhere. */
export async function mainList(em: EntityManager, householdId: string) {
  const list = await em.findOne(ShoppingList, { main: true })
  if (list) return list
  const created = em.create(ShoppingList, {
    household: householdId,
    name: "Shopping list",
    main: true,
  })
  await em.flush()
  return created
}

/** The household's lists, the main one first. */
export async function householdLists(em: EntityManager, householdId: string) {
  await mainList(em, householdId)
  const lists = await em.find(ShoppingList, {})
  return lists.sort(
    (a, b) =>
      Number(b.main) - Number(a.main) ||
      a.position - b.position ||
      a.createdAt.getTime() - b.createdAt.getTime()
  )
}

export function describeList(list: ShoppingList) {
  return {
    id: list.id,
    name: list.name,
    main: list.main,
    aisles: list.main ? [] : (list.aisles ?? []),
  }
}

/** One of the household's lists, or not found. */
export async function findList(em: EntityManager, id: string) {
  const list = UUID.test(id) ? await em.findOne(ShoppingList, { id }) : null
  if (!list) {
    throw new AppError("not_found", "list_not_found", "There's no such list.")
  }
  return list
}

/**
 * The list each food goes on: the one the household moved it to before,
 * else the one its aisle goes on, else the main list.
 */
export async function listsOf(
  em: EntityManager,
  householdId: string,
  foods: readonly { name: string; aisle?: { id: string } | null }[]
): Promise<ShoppingList[]> {
  const keyOf = await householdKeys(em)
  const lists = await householdLists(em, householdId)
  const main = lists[0]!
  if (foods.length === 0) return []
  if (lists.length === 1) return foods.map(() => main)
  const byId = new Map(lists.map((list) => [list.id, list]))
  const byAisle = new Map(
    lists.flatMap((list) =>
      list.main
        ? []
        : (list.aisles ?? []).map((aisle) => [aisle, list] as const)
    )
  )
  const keys = foods.map((food) => keyOf(food.name))
  const placed = await em.find(FoodPlacement, {
    foodKey: { $in: [...new Set(keys)] },
  })
  const byFood = new Map(
    placed.flatMap((placement) =>
      placement.list ? [[placement.foodKey, placement.list.id] as const] : []
    )
  )
  return foods.map(
    (food, index) =>
      byId.get(byFood.get(keys[index]!) ?? "") ??
      byAisle.get(food.aisle?.id ?? "") ??
      main
  )
}

/** Remembers which list these foods go on, for the next time. */
export async function rememberList(
  em: EntityManager,
  householdId: string,
  names: readonly string[],
  list: ShoppingList
) {
  const keyOf = await householdKeys(em)
  const keys = [...new Set(names.map(keyOf))]
  const known = new Map(
    (await em.find(FoodPlacement, { foodKey: { $in: keys } })).map(
      (placement) => [placement.foodKey, placement]
    )
  )
  // The main list too: meat moved there stays off the Costco list.
  const target = em.getReference(ShoppingList, list.id, { wrapped: true })
  for (const key of keys) {
    const placement = known.get(key)
    if (placement) placement.list = target
    else
      em.create(FoodPlacement, {
        household: householdId,
        foodKey: key,
        list: target,
      })
  }
}

export type ListInput = {
  /** An existing list's id; none for a new one. */
  id?: string | null
  name: string
  /** The ids of the aisles that go on it. The main list takes the rest. */
  aisles: string[]
}

function invalid(message: string) {
  return new AppError("invalid", "invalid_lists", message, { lists: message })
}

/**
 * Saves the household's lists as a whole, in order: new ones made, ones
 * left out removed (what's on them goes to the main list), and the rest
 * changed. Then what's waiting on the main list moves to the list its food
 * or aisle goes on now. The main list stays, and takes what no other list
 * does.
 */
export async function saveLists(
  em: EntityManager,
  householdId: string,
  inputs: readonly ListInput[]
) {
  return inHouseholdTransaction(em, householdId, async (tx) => {
    const lists = await householdLists(tx, householdId)
    const main = lists[0]!
    const byId = new Map(lists.map((list) => [list.id, list]))
    if (inputs.length > MAX_LISTS)
      throw invalid(`Have ${MAX_LISTS} lists at most.`)
    if (inputs.filter((input) => input.id === main.id).length !== 1)
      throw invalid("The main list has to stay.")
    for (const input of inputs) {
      if (input.id && !byId.has(input.id))
        throw new AppError(
          "not_found",
          "list_not_found",
          "There's no such list."
        )
    }
    const others = inputs.filter((input) => input.id !== main.id)
    const aisles = others.flatMap((input) => input.aisles)
    if (new Set(aisles).size !== aisles.length)
      throw invalid("An aisle goes on one list.")
    const known = new Set((await tx.find(Aisle, {})).map((aisle) => aisle.id))
    if (aisles.some((aisle) => !known.has(aisle)))
      throw new AppError(
        "not_found",
        "aisle_not_found",
        "There's no such aisle."
      )

    // Lists left out go, and what's on them goes to the main list.
    const kept = new Set(
      inputs.flatMap((input) => (input.id ? [input.id] : []))
    )
    const gone = lists.filter((list) => !kept.has(list.id))
    if (gone.length > 0) {
      const items = await tx.find(ShoppingItem, {
        list: { $in: gone.map((list) => list.id) },
      })
      for (const item of items)
        item.list = tx.getReference(ShoppingList, main.id, { wrapped: true })
      for (const list of gone) tx.remove(list)
    }

    for (const [position, input] of inputs.entries()) {
      const values = {
        name: input.name.trim(),
        aisles: input.id === main.id ? null : input.aisles,
        position,
      }
      const list = input.id ? byId.get(input.id)! : null
      if (list) tx.assign(list, values)
      else tx.create(ShoppingList, { household: householdId, ...values })
    }
    await tx.flush()

    // What's waiting on the main list goes where its food or aisle goes now.
    const waiting = await tx.find(ShoppingItem, {
      list: main.id,
      checked: false,
    })
    const targets = await listsOf(tx, householdId, waiting)
    for (const [index, item] of waiting.entries()) {
      const target = targets[index]!
      if (target.id !== main.id)
        item.list = tx.getReference(ShoppingList, target.id, { wrapped: true })
    }
    await tx.flush()
    return (await householdLists(tx, householdId)).map(describeList)
  })
}

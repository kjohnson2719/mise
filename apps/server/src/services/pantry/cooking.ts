import {
  addAmounts,
  combineLines,
  covers,
  foodKey,
  subtractAmounts,
  type Amount,
  type MealShare,
} from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import {
  Aisle,
  PantryItem,
  type PantrySnapshot,
  type PlanEntry,
} from "../../database/entities/index.ts"
import { householdAliases, householdKeys } from "../list/food-aliases.ts"
import { hasRecipe, loadMealLines } from "../plan/meal-lines.ts"
import { amountOf, measured, merged } from "./pantry.ts"

// Cooking a planned meal uses what it takes from the pantry: what was set
// aside for it first. It remembers what it took, so a meal that turns out
// not to be cooked (marked not cooked, taken off the plan, undone) puts it
// back: what it used up comes back, and what it took comes off what's
// there now.

const shareOf = (item: PantryItem, meal: string) =>
  (item.forMeals ?? []).find((share) => share.meal === meal) ?? null

/** Takes what cooked meals need from the pantry, remembering what, to put back. */
export async function useForMeals(
  em: EntityManager,
  entries: readonly PlanEntry[]
) {
  const cooking = entries.filter((entry) => !entry.pantryUsed)
  if (cooking.length === 0) return
  const linesOf = await loadMealLines(em, cooking[0]!.household.id, cooking)
  const pantry = await em.find(PantryItem, {})
  const aliases = await householdAliases(em)
  const gone = new Set<string>()

  for (const entry of cooking) {
    /** Each row as it was, the first time this meal touched it. */
    const before = new Map<
      string,
      { amount: Amount; amountText: string | null; share: MealShare | null }
    >()
    const touch = (row: PantryItem) => {
      if (!before.has(row.id))
        before.set(row.id, {
          amount: amountOf(row),
          amountText: row.amountText ?? null,
          share: shareOf(row, entry.id),
        })
    }
    const needs = hasRecipe(entry) ? combineLines(linesOf(entry), aliases) : []
    for (const need of needs) {
      const key = need.food
      // What was set aside for this meal goes first, then the food itself
      // before a kind of it (the green bell pepper for a bell pepper).
      const rows = pantry
        .filter(
          (row) => row.foodKey && covers(row.foodKey, key) && !gone.has(row.id)
        )
        .sort(
          (a, b) =>
            Number(shareOf(b, entry.id) !== null) -
              Number(shareOf(a, entry.id) !== null) ||
            Number(b.foodKey === key) - Number(a.foodKey === key)
        )
      let left: Amount = { quantity: need.quantity, unit: need.unit }
      for (const row of rows) {
        if (!measured(row)) {
          // No telling how much is left: used up if it was for this meal.
          if (shareOf(row, entry.id)) {
            touch(row)
            gone.add(row.id)
          }
          break
        }
        // "Salt to taste" doesn't use up the salt.
        if (left.quantity === null) break
        const rest = subtractAmounts(amountOf(row), left, row.foodKey)
        if (!rest) continue
        touch(row)
        if (rest.quantity > 0.001) {
          row.quantity = rest.quantity
          break
        }
        // Not enough in this one: the rest from the next.
        const still = subtractAmounts(left, amountOf(row), row.foodKey)
        gone.add(row.id)
        if (!still || still.quantity <= 0.001) break
        left = still
      }
    }
    // It's cooked: nothing's set aside for it any more.
    for (const row of pantry) {
      if (!shareOf(row, entry.id)) continue
      touch(row)
      const kept = (row.forMeals ?? []).filter(
        (share) => share.meal !== entry.id
      )
      row.forMeals = kept.length > 0 ? kept : null
    }

    const used: PantrySnapshot = []
    for (const [id, was] of before) {
      const row = pantry.find((item) => item.id === id)!
      const removed = gone.has(id)
      const taken = removed
        ? was.amount
        : (subtractAmounts(was.amount, amountOf(row), row.foodKey) ?? {
            quantity: null,
            unit: null,
          })
      used.push({
        id,
        foodKey: row.foodKey,
        name: row.name,
        quantity: taken.quantity,
        unit: taken.unit,
        amountText: removed ? was.amountText : null,
        aisle: row.aisle?.id ?? null,
        storedIn: row.storedIn ?? null,
        useBy: row.useBy ?? null,
        share: was.share,
        removed,
        createdAt: row.createdAt.toISOString(),
      })
    }
    entry.pantryUsed = used.length > 0 ? used : null
  }
  for (const row of pantry) if (gone.has(row.id)) em.remove(row)
}

/** Puts back what cooking meals took from the pantry, when they weren't cooked. */
export async function putBack(
  em: EntityManager,
  householdId: string,
  entries: readonly PlanEntry[]
) {
  const keyOf = await householdKeys(em)
  for (const entry of entries) {
    for (const taken of entry.pantryUsed ?? []) {
      const row = await em.findOne(PantryItem, { id: taken.id })
      if (!row) {
        // Used up, or gone since: what was taken comes back.
        const aisle = taken.aisle
          ? await em.findOne(Aisle, { id: taken.aisle })
          : null
        em.create(PantryItem, {
          id: taken.id,
          household: householdId,
          foodKey: taken.foodKey || keyOf(taken.name),
          name: taken.name,
          quantity: taken.quantity,
          unit: taken.unit,
          amountText: taken.amountText,
          aisle,
          storedIn: taken.storedIn,
          useBy: taken.useBy,
          forMeals: taken.share ? [taken.share] : null,
          createdAt: new Date(taken.createdAt),
        })
        continue
      }
      if (taken.quantity !== null && measured(row)) {
        const sum = addAmounts(amountOf(row), taken, row.foodKey)
        if (sum) em.assign(row, { quantity: sum.quantity, unit: sum.unit })
      }
      if (taken.share)
        row.forMeals = merged([...(row.forMeals ?? []), taken.share])
    }
    entry.pantryUsed = null
  }
}

/**
 * Keeps the pantry following cooking: a meal now cooked uses what it
 * takes; one cooked before and not now (marked not cooked, skipped, taken
 * off) puts it back. Call it before a meal taken off goes.
 */
export async function followCooking(
  em: EntityManager,
  householdId: string,
  changes: readonly { entry: PlanEntry; was: boolean; now: boolean }[]
) {
  const undone = changes.filter((change) => change.was && !change.now)
  const cooked = changes.filter((change) => !change.was && change.now)
  if (undone.length === 0 && cooked.length === 0) return
  await putBack(
    em,
    householdId,
    undone.map((change) => change.entry)
  )
  await useForMeals(
    em,
    cooked.map((change) => change.entry)
  )
  await em.flush()
}

import {
  addAmounts,
  covers,
  foodKey,
  subtractAmounts,
  type Amount,
  type CombinedItem,
  type MealShare,
} from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { PantryItem } from "../../database/entities/index.ts"
import {
  available,
  householdToday,
  merged,
  pantryMeals,
  stillToCome,
} from "./pantry.ts"

// Counting on what's at home when meals go on the list. What a meal's
// covered by is set aside for it, so the next meals listed don't count on
// the same stock again, and cooking it uses that first.

/**
 * What's left to buy for meals going on the list, after what's at home
 * that isn't set aside for meals still to come. What covers a meal is set
 * aside for it. Says what was covered completely.
 */
export async function coverFromPantry(
  em: EntityManager,
  householdId: string,
  items: readonly CombinedItem[]
) {
  const pantry = await em.find(PantryItem, {})
  if (pantry.length === 0) return { items: [...items], inPantry: [] }
  const [meals, today] = await Promise.all([
    pantryMeals(em, pantry),
    householdToday(em, householdId),
  ])
  // The meals going on the list count as still to come.
  const listing = new Set(
    items.flatMap((item) => item.shares.map((share) => share.meal))
  )
  const setAside = (meal: string) =>
    listing.has(meal) || stillToCome(meals.get(meal), today)
  const setFor = (item: PantryItem, share: MealShare) => {
    item.forMeals = merged([...(item.forMeals ?? []), share])
  }

  const inPantry: string[] = []
  const left: CombinedItem[] = []
  for (const item of items) {
    const key = item.food
    // The food itself first, then a kind of it: a recipe's bell pepper is
    // met by the green bell pepper at home.
    const rows = pantry
      .filter((row) => row.foodKey && covers(row.foodKey, key))
      .sort((a, b) => Number(b.foodKey === key) - Number(a.foodKey === key))
    if (rows.length === 0) {
      left.push(item)
      continue
    }
    const shares: MealShare[] = []
    for (const share of item.shares) {
      let need: Amount = { quantity: share.quantity, unit: share.unit }
      let covered = false
      for (const row of rows) {
        const free = available(row, setAside)
        // No telling how much there is, or none needed in particular:
        // having some is enough.
        if (free === null || need.quantity === null) {
          setFor(row, { meal: share.meal, ...need })
          covered = true
          break
        }
        if (free.quantity === null || free.quantity <= 0.001) continue
        const rest = subtractAmounts(need, free, key)
        if (!rest) continue
        if (rest.quantity <= 0.001) {
          setFor(row, { meal: share.meal, ...need })
          covered = true
          break
        }
        setFor(row, { meal: share.meal, ...free })
        need = rest
      }
      if (!covered) shares.push({ meal: share.meal, ...need })
    }
    if (shares.length === 0) {
      inPantry.push(item.name.toLowerCase())
      continue
    }
    let total: Amount = { quantity: shares[0]!.quantity, unit: shares[0]!.unit }
    for (const share of shares.slice(1))
      total = addAmounts(total, share, key) ?? total
    left.push({ ...item, ...total, shares })
  }
  return { items: left, inPantry }
}

/** Frees what's set aside at home for meals that won't need it now. */
export async function releasePantry(
  em: EntityManager,
  meals: ReadonlySet<string>
) {
  if (meals.size === 0) return
  for (const item of await em.find(PantryItem, {})) {
    const shares = item.forMeals ?? []
    const kept = shares.filter((share) => !meals.has(share.meal))
    if (kept.length !== shares.length)
      item.forMeals = kept.length > 0 ? kept : null
  }
}

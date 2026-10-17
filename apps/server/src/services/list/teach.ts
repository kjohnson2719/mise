import { householdKey, lineFoods, plainKey } from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { AppError } from "../../core/errors.ts"
import { FoodAlias, PlanEntry } from "../../database/entities/index.ts"
import { hasRecipe, loadMealLines } from "../plan/meal-lines.ts"
import { apartName, householdAliases, saveAlias } from "./food-aliases.ts"
import { findItem } from "./list.ts"
import { rekeyHousehold } from "./rekey.ts"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Teaching Merran a household's own foods from the list (docs/foods.md):
// "Same as…" joins one thing to another from now on, and "Not the same"
// keeps a name apart that it joined.

/**
 * One thing on the list is the same food as another, for the household:
 * its food is the other's from now on, here, at home and in what's to
 * come, and the two lines join where they add up.
 */
export async function sameAs(
  em: EntityManager,
  householdId: string,
  itemId: string,
  otherId: string
) {
  const item = await findItem(em, itemId)
  const other = await findItem(em, otherId)
  if (item.id === other.id) {
    throw new AppError(
      "invalid",
      "same_item",
      "Pick something else on the list.",
      { item: "Pick something else on the list." }
    )
  }
  const from = item.foodKey ?? plainKey(item.name)
  const to = other.foodKey ?? plainKey(other.name)
  const food = from === to ? to : await saveAlias(em, householdId, from, to)
  await em.flush()
  // Every key made again with it: the list's lines join, and what's at
  // home, aisles and store products follow.
  const { joined } = await rekeyHousehold(em)
  return { food, joined }
}

/**
 * The names a line on the list was joined from: its own, and those of the
 * recipe lines for its meals that came to the same food.
 */
export async function joinedNames(em: EntityManager, itemId: string) {
  const item = await findItem(em, itemId)
  const names = new Map<string, string>([[plainKey(item.name), item.name]])
  const meals = [...new Set((item.forMeals ?? []).map((share) => share.meal))]
  if (meals.length > 0 && item.foodKey) {
    const entries = await em.find(PlanEntry, { id: { $in: meals } })
    const aliases = await householdAliases(em)
    const linesOf = await loadMealLines(em, item.household.id, entries)
    for (const entry of entries) {
      if (!hasRecipe(entry)) continue
      for (const line of linesOf(entry)) {
        const foods = lineFoods(line.text)
        for (const food of foods) {
          const key = householdKey(
            food.name,
            line.food && foods.length === 1 ? line.food : food.key,
            aliases
          )
          const name = food.name.toLowerCase()
          if (key === item.foodKey && !names.has(plainKey(name))) {
            names.set(plainKey(name), name)
          }
        }
      }
    }
  }
  return [...names.values()]
}

/**
 * Names that aren't the same as the rest of their line, for the household:
 * each its own food from the next list on.
 */
export async function keepApart(
  em: EntityManager,
  householdId: string,
  itemId: string,
  names: readonly string[]
) {
  await findItem(em, itemId)
  const kept = [...new Set(names.map(apartName).filter(Boolean))]
  for (const name of kept) await saveAlias(em, householdId, name, name)
  await em.flush()
  return { kept: kept.length }
}

/** Forgets one of the household's names; keys are made again without it. */
export async function forgetAlias(em: EntityManager, id: string) {
  const row = UUID.test(id) ? await em.findOne(FoodAlias, { id }) : null
  if (!row) {
    throw new AppError(
      "not_found",
      "food_alias_not_found",
      "Merran doesn't have that one."
    )
  }
  em.remove(row)
  await em.flush()
  await rekeyHousehold(em)
}

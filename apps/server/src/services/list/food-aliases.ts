import {
  foodKeyIn,
  NO_ALIASES,
  plainKey,
  type FoodAliases,
} from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { FoodAlias } from "../../database/entities/index.ts"

// A household's own names for foods (docs/foods.md): "Same as…" and "Not
// the same" on the list, which win over the vocabulary for it.

/** The household's names, by a food's key or a name's plain form. */
export async function householdAliases(
  em: EntityManager
): Promise<FoodAliases> {
  const rows = await em.find(FoodAlias, {})
  return rows.length === 0
    ? NO_ALIASES
    : new Map(rows.map((row) => [row.name, row.foodKey]))
}

/** A food's key for the household, by its name: `foodKey` with its names. */
export async function householdKeys(em: EntityManager) {
  const aliases = await householdAliases(em)
  return (name: string) => foodKeyIn(name, aliases)
}

/**
 * Keeps a name for the household: a food's key made another's, or a
 * name's plain form kept its own. What pointed at the name points on, so
 * there's never a chain.
 */
export async function saveAlias(
  em: EntityManager,
  householdId: string,
  name: string,
  foodKey: string
) {
  const rows = await em.find(FoodAlias, {})
  const target = rows.find((row) => row.name === foodKey)?.foodKey ?? foodKey
  for (const row of rows) if (row.foodKey === name) row.foodKey = target
  const row = rows.find((one) => one.name === name)
  if (row) row.foodKey = target
  else em.create(FoodAlias, { household: householdId, name, foodKey: target })
  return target
}

/** The household's names, as the API shows them. */
export async function listAliases(em: EntityManager) {
  const rows = await em.find(FoodAlias, {}, { orderBy: { name: "asc" } })
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    food: row.foodKey,
    // Kept its own food ("Not the same"), or another's ("Same as…").
    apart: row.name === row.foodKey,
  }))
}

/** A name's plain form, as "Not the same" keeps it. */
export const apartName = (name: string) => plainKey(name.trim())

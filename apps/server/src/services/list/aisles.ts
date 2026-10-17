import { aislesFor, foodKey, guessAisle } from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { AppError } from "../../core/errors.ts"
import {
  Aisle,
  FoodPlacement,
  Household,
} from "../../database/entities/index.ts"
import { householdKeys } from "./food-aliases.ts"

// Aisles: each household starts with its country's, in a typical walk
// through the store. Food goes in the aisle the household last put it in,
// else a first guess.

/** The household's aisles in walking order, its country's to start. */
export async function householdAisles(em: EntityManager, householdId: string) {
  const aisles = await em.find(Aisle, {}, { orderBy: { position: "asc" } })
  if (aisles.length > 0) return aisles
  const household = await em.findOneOrFail(Household, { id: householdId })
  const created = aislesFor(household.country).map((aisle, position) =>
    em.create(Aisle, {
      household: householdId,
      name: aisle.name,
      key: aisle.key,
      position,
    })
  )
  await em.flush()
  return created
}

export function describeAisle(aisle: Aisle) {
  return { id: aisle.id, name: aisle.name, position: aisle.position }
}

/** Each food's aisle: where the household last put it, else a guess. */
export async function aislesOf(
  em: EntityManager,
  householdId: string,
  foods: readonly { name: string; unit?: string | null }[]
): Promise<(Aisle | null)[]> {
  const keyOf = await householdKeys(em)
  if (foods.length === 0) return []
  const aisles = await householdAisles(em, householdId)
  const keys = foods.map((food) => keyOf(food.name))
  const placed = await em.find(FoodPlacement, {
    foodKey: { $in: [...new Set(keys)] },
  })
  const byId = new Map(aisles.map((aisle) => [aisle.id, aisle]))
  const byKey = new Map(aisles.map((aisle) => [aisle.key, aisle]))
  const byFood = new Map(
    placed.flatMap((placement) =>
      placement.aisle ? [[placement.foodKey, placement.aisle.id] as const] : []
    )
  )
  return foods.map((food, index) => {
    const learned = byId.get(byFood.get(keys[index]!) ?? "")
    return (
      learned ??
      byKey.get(guessAisle(food.name, food.unit)) ??
      byKey.get("other") ??
      null
    )
  })
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** One of the household's aisles, or not found. */
export async function findAisle(em: EntityManager, id: string) {
  const aisle = UUID.test(id) ? await em.findOne(Aisle, { id }) : null
  if (!aisle) {
    throw new AppError("not_found", "aisle_not_found", "There's no such aisle.")
  }
  return aisle
}

/** Remembers where these foods go, for the next time they're on the list. */
export async function rememberAisle(
  em: EntityManager,
  householdId: string,
  names: readonly string[],
  aisle: Aisle | null
) {
  const keyOf = await householdKeys(em)
  const keys = [...new Set(names.map(keyOf))]
  const known = new Map(
    (await em.find(FoodPlacement, { foodKey: { $in: keys } })).map(
      (placement) => [placement.foodKey, placement]
    )
  )
  for (const key of keys) {
    const placement = known.get(key)
    if (placement)
      placement.aisle = aisle
        ? em.getReference(Aisle, aisle.id, { wrapped: true })
        : null
    else
      em.create(FoodPlacement, {
        household: householdId,
        foodKey: key,
        aisle,
      })
  }
}

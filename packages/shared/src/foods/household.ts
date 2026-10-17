import { foodKey, plainKey, shoppingName } from "../list/food.ts"
import { FOODS } from "./data/foods.ts"

// A household's own names for foods (docs/foods.md), which win over the
// vocabulary for that household: "Same as…" on a list line makes one
// food's key another's ("these butter sticks are butter"), and "Not the
// same" keeps a name its own food ("unsalted butter" apart from butter).

/** Where a recipe line's food came from. */
export const FOOD_SOURCES = ["vocabulary", "person", "ai"] as const
export type FoodSource = (typeof FOOD_SOURCES)[number]

/**
 * A household's names, by a food's key ("Same as…") or a name's plain
 * form ("Not the same"), to the food each is for it.
 */
export type FoodAliases = ReadonlyMap<string, string>

export const NO_ALIASES: FoodAliases = new Map()

/**
 * A food's key for a household: the name kept as its own food, else its
 * key made another's, else the key.
 */
export function householdKey(
  name: string,
  key: string,
  aliases: FoodAliases
): string {
  if (aliases.size === 0) return key
  return aliases.get(plainKey(name)) ?? aliases.get(key) ?? key
}

/** Every food Merran knows, by key: what a line can be said to be. */
export function foodsToChoose(): string[] {
  return Object.keys(FOODS)
}

/** Whether a food key is one Merran knows. */
export const isKnownFood = (key: string) => Object.hasOwn(FOODS, key)

/** `foodKey` for a household, with its own names. */
export function foodKeyIn(food: string, aliases: FoodAliases): string {
  const key = foodKey(food)
  return aliases.size === 0
    ? key
    : householdKey(shoppingName(food), key, aliases)
}

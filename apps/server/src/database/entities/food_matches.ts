import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { updatedAt } from "./base.ts"

/**
 * Which USDA food an ingredient is ("onion" is 170000), or none, and what
 * one of each unit was found to weigh. Worked out once, for every
 * household: it's about food, not anyone's recipes.
 */
export const FoodMatch = defineEntity({
  name: "FoodMatch",
  tableName: "food_matches",
  properties: {
    /** The food as matches are kept: "chopped onions" is "onion". */
    food: p.string().primary(),
    /** Null when no USDA food is it. */
    fdcId: p.integer().nullable(),
    /** Grams for one of a unit ("cup", or "each" for a count), learned. */
    grams: p.json<Record<string, number>>(),
    updatedAt: updatedAt(),
  },
})
export type FoodMatch = InferEntity<typeof FoodMatch>

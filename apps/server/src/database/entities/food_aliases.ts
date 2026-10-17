import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { householdFilter } from "../scope.ts"
import { foodKey, id, updatedAt } from "./base.ts"
import { householdRef } from "./households.ts"

/**
 * A household's own name for a food (docs/foods.md), winning over the
 * vocabulary for it: "Same as…" on a list line makes one food's key
 * another's, and "Not the same" keeps a name its own food.
 */
export const FoodAlias = defineEntity({
  name: "FoodAlias",
  tableName: "food_aliases",
  properties: {
    id: id(),
    household: () => householdRef(),
    /** A food's key ("Same as…"), or a name's plain form ("Not the same"). */
    name: p.string(),
    /** The food it is, for this household. */
    foodKey: foodKey(),
    updatedAt: updatedAt(),
  },
  uniques: [{ properties: ["household", "name"] }],
  filters: householdFilter,
})
export type FoodAlias = InferEntity<typeof FoodAlias>

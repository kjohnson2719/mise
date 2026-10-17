import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { householdFilter } from "../scope.ts"
import { aisleRef } from "./aisles.ts"
import { foodKey, id, updatedAt } from "./base.ts"
import { householdRef } from "./households.ts"
import { ShoppingList } from "./shopping_lists.ts"

/**
 * Where the household keeps sending a food, learned when someone moves it.
 * It wins over the aisle's usual list.
 */
export const FoodPlacement = defineEntity({
  name: "FoodPlacement",
  tableName: "food_placements",
  properties: {
    id: id(),
    household: () => householdRef(),
    foodKey: foodKey(),
    aisle: () => aisleRef(),
    list: () =>
      p.manyToOne(ShoppingList).ref().nullable().deleteRule("set null"),
    updatedAt: updatedAt(),
  },
  uniques: [{ properties: ["household", "foodKey"] }],
  filters: householdFilter,
})
export type FoodPlacement = InferEntity<typeof FoodPlacement>

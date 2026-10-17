import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { householdFilter } from "../scope.ts"
import { aisleRef } from "./aisles.ts"
import { id } from "./base.ts"
import { householdRef } from "./households.ts"
import { ShoppingList } from "./shopping_lists.ts"

/** Bought every week whatever's planned (bananas, Diet Pepsi). */
export const WeeklyItem = defineEntity({
  name: "WeeklyItem",
  tableName: "weekly_items",
  properties: {
    id: id(),
    household: () => householdRef(),
    name: p.string(),
    amountText: p.string().nullable(),
    aisle: () => aisleRef(),
    list: () =>
      p.manyToOne(ShoppingList).ref().nullable().deleteRule("set null"),
    position: p.integer().default(0),
  },
  filters: householdFilter,
})
export type WeeklyItem = InferEntity<typeof WeeklyItem>

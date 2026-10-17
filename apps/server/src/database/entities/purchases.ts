import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { householdFilter } from "../scope.ts"
import { amount, createdAt, day, foodKey, id } from "./base.ts"
import { householdRef } from "./households.ts"

/**
 * Something bought and put away. Usual buys ("milk about every 6 days") and
 * what's left of a package are worked out from these.
 */
export const Purchase = defineEntity({
  name: "Purchase",
  tableName: "purchases",
  properties: {
    id: id(),
    household: () => householdRef(),
    foodKey: foodKey(),
    name: p.string(),
    ...amount(),
    boughtOn: day(),
    createdAt: createdAt(),
  },
  indexes: [{ properties: ["household", "foodKey"] }],
  filters: householdFilter,
})
export type Purchase = InferEntity<typeof Purchase>

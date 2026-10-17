import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import type { StoreProduct as Product } from "@merran/shared"
import { householdFilter } from "../scope.ts"
import { createdAt, foodKey, id, updatedAt } from "./base.ts"
import { householdRef } from "./households.ts"

/**
 * The product a household buys at a store for a food: Merran's pick, or
 * one a person chose, which is never replaced by itself.
 */
export const StoreProduct = defineEntity({
  name: "StoreProduct",
  tableName: "store_products",
  properties: {
    id: id(),
    household: () => householdRef(),
    store: p.string(),
    /** The food, as the list keeps it: "chicken thigh". */
    food: foodKey(),
    product: p.json<Product>(),
    /** A person picked it, or it was sent to the cart: kept as it is. */
    chosen: p.boolean().default(false),
    /**
     * What the store had for the food when it was last looked for, to pick
     * another from without looking again: Walmart's search, as the browser
     * extension read it.
     */
    options: p.json<Product[]>().nullable(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  uniques: [{ properties: ["household", "store", "food"] }],
  filters: householdFilter,
})
export type StoreProduct = InferEntity<typeof StoreProduct>

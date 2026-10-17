import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { householdFilter } from "../scope.ts"
import { createdAt, day, id } from "./base.ts"
import { householdRef } from "./households.ts"

/**
 * A product's price as a household saw it on a day, at its store: the
 * history sales are judged against and "usually $4.29" comes from. In the
 * currency's smallest unit (cents).
 */
export const StorePrice = defineEntity({
  name: "StorePrice",
  tableName: "store_prices",
  properties: {
    id: id(),
    household: () => householdRef(),
    store: p.string(),
    productId: p.string(),
    day: day(),
    price: p.integer().nullable(),
    salePrice: p.integer().nullable(),
    saleEnds: day().nullable(),
    currency: p.string().length(3),
    createdAt: createdAt(),
  },
  uniques: [{ properties: ["household", "store", "productId", "day"] }],
  filters: householdFilter,
})
export type StorePrice = InferEntity<typeof StorePrice>

import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { householdFilter } from "../scope.ts"
import { id } from "./base.ts"
import { householdRef } from "./households.ts"

/**
 * An aisle ("Produce"). Each household gets its country's aisles to start,
 * and can rename, add and reorder them.
 */
export const Aisle = defineEntity({
  name: "Aisle",
  tableName: "aisles",
  properties: {
    id: id(),
    household: () => householdRef(),
    name: p.string(),
    position: p.integer(),
    /** The default aisle this started as ("produce"), so food can be sorted into it. */
    key: p.string().nullable(),
  },
  filters: householdFilter,
})
export type Aisle = InferEntity<typeof Aisle>

/** An optional `aisle` property; the item stays if its aisle is removed. */
export const aisleRef = () =>
  p.manyToOne(Aisle).ref().nullable().deleteRule("set null")

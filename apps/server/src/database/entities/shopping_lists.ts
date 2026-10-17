import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { householdFilter } from "../scope.ts"
import { createdAt, id } from "./base.ts"
import { householdRef } from "./households.ts"

/**
 * A shopping list: a name, and the aisles that go on it. Every household
 * has one main list, which takes anything not sent elsewhere. Which store
 * something's bought at is chosen for each thing, not for its list.
 */
export const ShoppingList = defineEntity({
  name: "ShoppingList",
  tableName: "shopping_lists",
  properties: {
    id: id(),
    household: () => householdRef(),
    name: p.string(),
    main: p.boolean().default(false),
    position: p.integer().default(0),
    /** Ids of the aisles that go on this list. */
    aisles: p.json<string[]>().nullable(),
    createdAt: createdAt(),
  },
  filters: householdFilter,
})
export type ShoppingList = InferEntity<typeof ShoppingList>

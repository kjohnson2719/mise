import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { householdFilter } from "../scope.ts"
import { id } from "./base.ts"
import { householdRef } from "./households.ts"

export const Tag = defineEntity({
  name: "Tag",
  tableName: "tags",
  properties: {
    id: id(),
    household: () => householdRef(),
    name: p.string(),
    /** The name in lowercase, so "Dinner" and "dinner" are one tag. */
    nameKey: p.string(),
  },
  uniques: [{ properties: ["household", "nameKey"] }],
  filters: householdFilter,
})
export type Tag = InferEntity<typeof Tag>

import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { householdFilter } from "../scope.ts"
import { createdAt, id, updatedAt } from "./base.ts"
import { householdRef } from "./households.ts"
import { User } from "./users.ts"

export const DISCOVERY_STATUSES = ["searching", "done", "failed"] as const

/** A recipe Discover found: a page Merran opened and can import. */
export type DiscoveredRecipe = {
  url: string
  name: string
  site: string
  /** Minutes in all, when the page says. */
  minutes: number | null
  /** Its photo on the page, when it has one. */
  photo: string | null
  /** Why it's a good pick, in a line. */
  why: string
}

/** A search for new recipes online, for a theme: "cozy fall soups". */
export const Discovery = defineEntity({
  name: "Discovery",
  tableName: "discoveries",
  properties: {
    id: id(),
    household: () => householdRef(),
    user: () => p.manyToOne(User).ref().nullable().deleteRule("set null"),
    theme: p.string(),
    /** The starter collection it found more for, by its id, if one. */
    collection: p.string().nullable(),
    status: p.enum(DISCOVERY_STATUSES),
    error: p.text().nullable(),
    recipes: p.json<DiscoveredRecipe[]>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  indexes: [{ properties: ["household", "createdAt"] }],
  filters: householdFilter,
})
export type Discovery = InferEntity<typeof Discovery>

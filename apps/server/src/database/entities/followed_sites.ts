import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { householdFilter } from "../scope.ts"
import { createdAt, id } from "./base.ts"
import { householdRef } from "./households.ts"
import { RecipeSite } from "./recipe_sites.ts"

/** A recipe site a household follows, to see its newest recipes. */
export const FollowedSite = defineEntity({
  name: "FollowedSite",
  tableName: "followed_sites",
  properties: {
    id: id(),
    household: () => householdRef(),
    site: () => p.manyToOne(RecipeSite).ref().deleteRule("cascade"),
    createdAt: createdAt(),
  },
  uniques: [{ properties: ["household", "site"] }],
  filters: householdFilter,
})
export type FollowedSite = InferEntity<typeof FollowedSite>

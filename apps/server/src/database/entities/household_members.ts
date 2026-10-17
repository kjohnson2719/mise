import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { householdFilter } from "../scope.ts"
import { createdAt, id } from "./base.ts"
import { householdRef } from "./households.ts"
import { User } from "./users.ts"

export const HOUSEHOLD_ROLES = ["owner", "admin", "member"] as const

/**
 * Who belongs to a household, with what role: Better Auth's member. A person
 * can belong to more than one.
 */
export const HouseholdMember = defineEntity({
  name: "HouseholdMember",
  tableName: "household_members",
  properties: {
    id: id(),
    household: () => householdRef(),
    user: () => p.manyToOne(User).ref().deleteRule("cascade").index(),
    role: p.enum(HOUSEHOLD_ROLES).default("member"),
    createdAt: createdAt(),
  },
  uniques: [{ properties: ["household", "user"] }],
  filters: householdFilter,
})
export type HouseholdMember = InferEntity<typeof HouseholdMember>

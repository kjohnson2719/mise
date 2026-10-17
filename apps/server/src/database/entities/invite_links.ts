import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { householdFilter } from "../scope.ts"
import { createdAt, id } from "./base.ts"
import { householdRef } from "./households.ts"
import { User } from "./users.ts"

export const INVITE_ROLES = ["admin", "member"] as const

/**
 * A link that lets whoever has it join a household, once, within a week.
 * Only a hash of its token is kept, so the link can only be shown when it's
 * made.
 */
export const InviteLink = defineEntity({
  name: "InviteLink",
  tableName: "invite_links",
  properties: {
    id: id(),
    household: () => householdRef(),
    tokenHash: p.string().unique(),
    role: p.enum(INVITE_ROLES).default("member"),
    createdBy: () => p.manyToOne(User).ref().nullable().deleteRule("set null"),
    expiresAt: p.datetime(),
    usedAt: p.datetime().nullable(),
    usedBy: () => p.manyToOne(User).ref().nullable().deleteRule("set null"),
    createdAt: createdAt(),
  },
  filters: householdFilter,
})
export type InviteLink = InferEntity<typeof InviteLink>

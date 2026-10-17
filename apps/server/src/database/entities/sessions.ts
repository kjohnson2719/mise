import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { createdAt, id, updatedAt } from "./base.ts"
import { Household } from "./households.ts"
import { User } from "./users.ts"

/** A signed-in device: Better Auth's session, with its organization and admin plugins. */
export const Session = defineEntity({
  name: "Session",
  tableName: "sessions",
  properties: {
    id: id(),
    expiresAt: p.datetime(),
    token: p.string().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: p.string().nullable(),
    userAgent: p.text().nullable(),
    user: () => p.manyToOne(User).ref().deleteRule("cascade").index(),
    /** Better Auth's activeOrganizationId: the household in use on this device. */
    activeHousehold: () =>
      p.manyToOne(Household).ref().nullable().deleteRule("set null"),
    impersonatedBy: p.string().nullable(),
  },
})
export type Session = InferEntity<typeof Session>

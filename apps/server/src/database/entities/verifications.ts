import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { createdAt, id, updatedAt } from "./base.ts"

/** Short-lived codes, for email checks and password resets: Better Auth's verification. */
export const Verification = defineEntity({
  name: "Verification",
  tableName: "verifications",
  properties: {
    id: id(),
    identifier: p.string().index(),
    value: p.text(),
    expiresAt: p.datetime(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
})
export type Verification = InferEntity<typeof Verification>

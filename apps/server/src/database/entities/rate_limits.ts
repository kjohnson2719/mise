import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { id } from "./base.ts"

/** Better Auth's rate limits, kept in the database so a restart doesn't reset them. */
export const RateLimit = defineEntity({
  name: "RateLimit",
  tableName: "rate_limits",
  properties: {
    id: id(),
    key: p.string().unique(),
    count: p.integer(),
    /** Milliseconds since 1970, as Better Auth writes it. */
    lastRequest: p.bigint("number"),
  },
})
export type RateLimit = InferEntity<typeof RateLimit>

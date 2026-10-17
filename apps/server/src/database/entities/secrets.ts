import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { createdAt, id, updatedAt } from "./base.ts"

/**
 * Every secret Merran keeps, like AI keys, sealed (see
 * services/secrets/secret-box.ts). Other tables point here, so changing the
 * master key only touches this table. A secret belongs to whatever points
 * at it, which deletes it along with itself.
 */
export const Secret = defineEntity({
  name: "Secret",
  tableName: "secrets",
  properties: {
    id: id(),
    /** Which master key sealed it. */
    keyId: p.string().index(),
    dataKey: p.text(),
    value: p.text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
})
export type Secret = InferEntity<typeof Secret>

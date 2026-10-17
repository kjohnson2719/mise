import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { householdFilter } from "../scope.ts"
import { createdAt, id } from "./base.ts"
import { householdRef } from "./households.ts"
import { User } from "./users.ts"

/** What a key may do in each area: read, or read and write. */
export type ApiKeyPermissions = Partial<Record<string, "read" | "write">>

/**
 * A person's API key, for scripts and tools like Home Assistant. It acts as
 * that person in one household, with only the permissions it was given.
 * Only a hash of the key is kept, so it's shown once, when it's made.
 */
export const ApiKey = defineEntity({
  name: "ApiKey",
  tableName: "api_keys",
  properties: {
    id: id(),
    household: () => householdRef(),
    user: () => p.manyToOne(User).ref().deleteRule("cascade").index(),
    name: p.string(),
    /** The key's first few characters, so people can tell their keys apart. */
    start: p.string(),
    keyHash: p.string().unique(),
    permissions: p.json<ApiKeyPermissions>(),
    expiresAt: p.datetime().nullable(),
    lastUsedAt: p.datetime().nullable(),
    createdAt: createdAt(),
  },
  filters: householdFilter,
})
export type ApiKey = InferEntity<typeof ApiKey>

import { createHash, randomBytes } from "node:crypto"
import type { EntityManager } from "@mikro-orm/sql"
import {
  ApiKey,
  type ApiKeyPermissions,
} from "../../database/entities/index.ts"
import { ACROSS_HOUSEHOLDS } from "../../database/scope.ts"
import { roleIn, type HouseholdRole } from "../households.ts"

/** Every key starts with this, so secret scanners can spot a leaked one. */
export const API_KEY_PREFIX = "mrn_"

/** What a key can be allowed to do. `household` is only ever read. */
export const API_AREAS = [
  "household",
  "recipes",
  "plan",
  "list",
  "pantry",
  "imports",
  "assistant",
] as const

export type ApiArea = (typeof API_AREAS)[number]
export type ApiAccess = "read" | "write"

/** Last used is noted at most this often, so a busy key isn't a write per request. */
const LAST_USED_EVERY_MS = 10 * 60 * 1000

function hash(key: string) {
  return createHash("sha256").update(key).digest("hex")
}

/** Whether a key's permissions cover this. Write includes read. */
export function allows(
  permissions: ApiKeyPermissions,
  area: ApiArea,
  access: ApiAccess
) {
  const given = permissions[area]
  return given === "write" || (given === "read" && access === "read")
}

/** Makes a key. The key itself is returned once and never kept. */
export async function createApiKey(
  em: EntityManager,
  {
    userId,
    householdId,
    name,
    permissions,
    expiresInDays,
  }: {
    userId: string
    householdId: string
    name: string
    permissions: ApiKeyPermissions
    expiresInDays: number | null
  }
) {
  const key = `${API_KEY_PREFIX}${randomBytes(32).toString("base64url")}`
  const apiKey = em.create(ApiKey, {
    household: householdId,
    user: userId,
    name,
    start: key.slice(0, API_KEY_PREFIX.length + 6),
    keyHash: hash(key),
    permissions,
    expiresAt:
      expiresInDays === null
        ? null
        : new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
  })
  await em.flush()
  return { apiKey, key }
}

export type VerifiedApiKey = {
  apiKey: ApiKey
  user: {
    id: string
    name: string
    email: string
    username: string | null
    displayUsername: string | null
    role: string | null
  }
  role: HouseholdRole
}

/**
 * The key, its person and their role in its household, or null when the key
 * doesn't work: unknown, expired, its person banned, or no longer in the
 * household.
 */
export async function verifyApiKey(
  em: EntityManager,
  key: string
): Promise<VerifiedApiKey | null> {
  if (!key.startsWith(API_KEY_PREFIX)) return null

  const apiKey = await em.findOne(
    ApiKey,
    { keyHash: hash(key) },
    { ...ACROSS_HOUSEHOLDS, populate: ["user"] }
  )
  if (!apiKey) return null
  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) return null

  const user = apiKey.user.getEntity()
  if (user.banned) return null

  const role = await roleIn(em, user.id, apiKey.household.id)
  if (!role) return null

  if (
    !apiKey.lastUsedAt ||
    Date.now() - apiKey.lastUsedAt.getTime() > LAST_USED_EVERY_MS
  ) {
    await em.nativeUpdate(
      ApiKey,
      { id: apiKey.id },
      { lastUsedAt: new Date() },
      ACROSS_HOUSEHOLDS
    )
  }

  return {
    apiKey,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.username ?? null,
      displayUsername: user.displayUsername ?? null,
      role: user.role ?? null,
    },
    role,
  }
}

/** A person's keys, in every household they're in, newest first. */
export async function listApiKeys(em: EntityManager, userId: string) {
  return em.find(
    ApiKey,
    { user: userId },
    {
      ...ACROSS_HOUSEHOLDS,
      populate: ["household"],
      orderBy: { createdAt: "desc" },
    }
  )
}

/** Revokes one of a person's own keys. False when there's no such key. */
export async function revokeApiKey(
  em: EntityManager,
  userId: string,
  keyId: string
) {
  const removed = await em.nativeDelete(
    ApiKey,
    { id: keyId, user: userId },
    ACROSS_HOUSEHOLDS
  )
  return removed > 0
}

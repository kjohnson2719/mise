import type { EntityManager } from "@mikro-orm/sql"
import type { ApiKeyPermissions } from "../../database/entities/index.ts"
import { AppError } from "../../core/errors.ts"
import { resolveActiveHousehold, type ActiveHousehold } from "../households.ts"
import { API_KEY_PREFIX, verifyApiKey } from "./api-keys.ts"
import type { Auth } from "./auth.ts"

/** Whoever sent the request, however they signed in. */
export type CurrentUser = {
  id: string
  name: string
  email: string
  username: string | null
  displayUsername: string | null
  /** "admin" for the server admin. */
  role: string | null
}

export type Authenticated = {
  user: CurrentUser
  /** The signed-in session; null when the request came with an API key. */
  session: { id: string } | null
  /** The household in use (a key's own household), or null when they're in none. */
  household: ActiveHousehold | null
  /** The API key used, if one was. */
  apiKey: { id: string; name: string; permissions: ApiKeyPermissions } | null
}

/**
 * Who sent a request, from its headers: an API key (`Authorization: Bearer
 * mrn_…`) or the session cookie. Not tied to HTTP routes, so anything that
 * receives headers (MCP, say) can check them the same way.
 */
export async function authenticate(
  auth: Auth,
  em: EntityManager,
  headers: Headers
): Promise<Authenticated | null> {
  const bearer = headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1]
  if (bearer) return withApiKey(em, bearer)

  const found = await auth.api.getSession({ headers })
  if (!found) return null

  const household = await resolveActiveHousehold(em, {
    userId: found.user.id,
    sessionId: found.session.id,
    activeHouseholdId: found.session.activeOrganizationId ?? null,
  })
  return {
    user: {
      id: found.user.id,
      name: found.user.name,
      email: found.user.email,
      username: found.user.username ?? null,
      displayUsername: found.user.displayUsername ?? null,
      role: found.user.role ?? null,
    },
    session: { id: found.session.id },
    household,
    apiKey: null,
  }
}

/** A request with a key is that key or nothing: it never falls back to a cookie. */
async function withApiKey(
  em: EntityManager,
  key: string
): Promise<Authenticated> {
  const verified = key.startsWith(API_KEY_PREFIX)
    ? await verifyApiKey(em, key)
    : null
  if (!verified) {
    throw new AppError(
      "unauthorized",
      "invalid_api_key",
      "That API key doesn't work. It may have expired or been revoked, or its person left the household."
    )
  }
  const { apiKey, user, role } = verified
  return {
    user,
    session: null,
    household: { id: apiKey.household.id, role },
    apiKey: {
      id: apiKey.id,
      name: apiKey.name,
      permissions: apiKey.permissions,
    },
  }
}

import type { Context, MiddlewareHandler } from "hono"
import { createMiddleware } from "hono/factory"
import type { AppEnv } from "../../core/context.ts"
import { forHousehold } from "../../database/scope.ts"
import {
  allows,
  type ApiAccess,
  type ApiArea,
} from "../../services/auth/api-keys.ts"
import type { Auth } from "../../services/auth/auth.ts"
import { KeyRateLimit } from "../../services/auth/key-rate-limit.ts"
import { authenticate } from "../../services/auth/session.ts"
import { isAdminRole } from "../../services/households.ts"
import { AppError } from "../../core/errors.ts"
import {
  API_KEY_SECURITY,
  SESSION_OR_API_KEY_SECURITY,
} from "../schemas/responses.ts"

/**
 * The OpenAPI extension that says which permission an API key needs for a
 * route, like `recipes:read`. Routes that refuse keys don't have it.
 */
export const KEY_PERMISSION = "x-merran-permission"

/**
 * For a route an API key may use, spread into its `createRoute()`. It puts
 * the permission in the API reference and hands the same one to
 * `inHousehold()`, so what the reference says and what's checked agree.
 * A route with middleware of its own keeps this one first:
 * `middleware: [...keys.middleware, bodyLimit(...)]`.
 */
export function openToKeys(area: ApiArea, access: ApiAccess) {
  return {
    security: SESSION_OR_API_KEY_SECURITY,
    [KEY_PERMISSION]: `${area}:${access}` as const,
    middleware: [
      createMiddleware<AppEnv>(async (c, next) => {
        c.set("keyPermission", { area, access })
        await next()
      }),
    ],
  }
}

/**
 * For a route only API keys use, with no permission needed: any working
 * key will do.
 */
export const OPEN_TO_ANY_KEY = {
  security: API_KEY_SECURITY,
  [KEY_PERMISSION]: "any",
} as const

/**
 * For a route open to any key that can read something, like the live
 * stream: what the key gets is up to what it can read. Use with
 * `readingHousehold()`.
 */
export const OPEN_TO_READERS = {
  security: SESSION_OR_API_KEY_SECURITY,
  [KEY_PERMISSION]: "any:read",
} as const

/**
 * Reads who sent each request (the auth service does the checking) and puts
 * them, the household they're using, and any API key they used on the
 * request. Requests with a key are also held to the key's rate limit.
 */
export function authenticateRequests(
  auth: Auth,
  limit = new KeyRateLimit()
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const found = await authenticate(auth, c.var.em, c.req.raw.headers)
    if (found?.apiKey) {
      const hit = limit.hit(found.apiKey.id)
      if (!hit.ok) {
        c.header("Retry-After", String(hit.retryAfter))
        throw new AppError(
          "rate_limited",
          "rate_limited",
          `This API key has made too many requests. Try again in ${hit.retryAfter} seconds.`
        )
      }
    }
    c.set("user", found?.user ?? null)
    c.set("session", found?.session ?? null)
    c.set("household", found?.household ?? null)
    c.set("apiKey", found?.apiKey ?? null)
    await next()
  }
}

// What a route needs from whoever's asking. Each throws the standard error
// when it isn't so, and returns what the route can then rely on. API keys
// are refused unless a route says which permission lets one in.

/** A person signed in with a session. API keys can't do this. */
export function signedIn(c: Context<AppEnv>) {
  const { user, session, apiKey } = c.var
  if (apiKey) {
    throw new AppError(
      "forbidden",
      "api_key_not_allowed",
      "API keys can't do this. Sign in instead."
    )
  }
  if (!user || !session) {
    throw new AppError("unauthorized", "signed_out", "Sign in first.")
  }
  return { user, session }
}

/** The server admin: whoever set the server up, and anyone they make one. */
export function serverAdmin(c: Context<AppEnv>) {
  const signed = signedIn(c)
  if (signed.user.role !== "admin") {
    throw new AppError(
      "forbidden",
      "not_server_admin",
      "Only the server admin can do that."
    )
  }
  return signed
}

/**
 * The household in use, with an entity manager that only sees it: the one
 * on this device for someone signed in, or the key's own household. An API
 * key gets in only when the route is `openToKeys()` and the key has that
 * permission.
 */
export function inHousehold(c: Context<AppEnv>) {
  const { user, apiKey, keyPermission: permission } = c.var
  if (apiKey) {
    if (!permission) {
      throw new AppError(
        "forbidden",
        "api_key_not_allowed",
        "API keys can't do this. Sign in instead."
      )
    }
    if (!allows(apiKey.permissions, permission.area, permission.access)) {
      throw new AppError(
        "forbidden",
        "missing_permission",
        `This API key can't ${permission.access} ${permission.area}.`
      )
    }
  } else {
    signedIn(c)
  }

  const household = c.var.household
  if (!user || !household) {
    throw new AppError(
      "forbidden",
      "no_household",
      "You're not in a household."
    )
  }
  return {
    householdId: household.id,
    role: household.role,
    em: forHousehold(c.var.em, household.id),
    userId: user.id,
  }
}

/**
 * The household in use for a route open to readers, and which of `areas`
 * the asker can read: all of them for someone signed in, those its
 * permissions say for a key. A key that can read none is turned away.
 */
export function readingHousehold<A extends ApiArea>(
  c: Context<AppEnv>,
  areas: readonly A[]
) {
  const { user, apiKey, household } = c.var
  let readable = areas
  if (apiKey) {
    readable = areas.filter((area) => allows(apiKey.permissions, area, "read"))
    if (readable.length === 0) {
      throw new AppError(
        "forbidden",
        "missing_permission",
        "This API key can't read anything."
      )
    }
  } else signedIn(c)
  if (!user || !household) {
    throw new AppError(
      "forbidden",
      "no_household",
      "You're not in a household."
    )
  }
  return { householdId: household.id, user, apiKey, readable }
}

/** The household in use, by one of its owners or admins, signed in: never a key. */
export function asHouseholdAdmin(c: Context<AppEnv>) {
  signedIn(c)
  const household = inHousehold(c)
  if (!isAdminRole(household.role)) {
    throw new AppError(
      "forbidden",
      "not_household_admin",
      "Only the household's admins can do that."
    )
  }
  return household
}

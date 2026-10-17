import { createHash, randomBytes } from "node:crypto"
import { ref } from "@mikro-orm/core"
import type { EntityManager } from "@mikro-orm/sql"
import type { AppDeps } from "../../core/context.ts"
import { AppError } from "../../core/errors.ts"
import { Secret, StoreConnection, User } from "../../database/entities/index.ts"
import { ACROSS_HOUSEHOLDS } from "../../database/scope.ts"
import { STORE_SETTINGS } from "../../modules/stores/settings.ts"
import {
  authorizeUrl,
  exchangeCode,
  krogerApp,
  KrogerSignInError,
  locationById,
  refreshTokens,
  type KrogerApp,
} from "./kroger.ts"

// A household's Kroger: the store it shops at, how its orders are
// collected, and the account linked to send things to its cart. One
// account for the household, so everyone shops one cart.

export type StoreDeps = Pick<AppDeps, "settings" | "fetcher">

/** How long a link being made waits for the person to come back. */
const LINK_FOR_MS = 15 * 60_000

export const KROGER = "kroger"

/** The server's Kroger app, or why there's none. */
export async function needKrogerApp(deps: StoreDeps): Promise<KrogerApp> {
  const app = await krogerApp(deps.settings)
  if (!app) {
    throw new AppError(
      "unprocessable",
      "kroger_off",
      "Kroger isn't set up on this server. The server admin adds a Kroger developer app in Settings, This server."
    )
  }
  return app
}

/** The household's connection to a store, made when first needed. */
export async function connectionOf(
  em: EntityManager,
  householdId: string,
  store: string = KROGER
) {
  return (
    (await em.findOne(StoreConnection, { store })) ??
    em.create(StoreConnection, { household: householdId, store })
  )
}

/** How the household's orders are collected: picked up unless it said. */
export function modalityOf(
  connection: Pick<StoreConnection, "modality"> | null | undefined
): "PICKUP" | "DELIVERY" {
  return connection?.modality === "DELIVERY" ? "DELIVERY" : "PICKUP"
}

/** The household's Kroger connection, if it has one with a store. */
export async function krogerConnection(em: EntityManager) {
  const found = await em.findOne(
    StoreConnection,
    { store: KROGER },
    { populate: ["linkedBy"] }
  )
  return found
}

/** Kroger for the household, as Settings and the list show it. */
export async function storesStatus(
  deps: StoreDeps,
  em: EntityManager,
  householdId: string
) {
  const ready = Boolean(await krogerApp(deps.settings))
  const found = await krogerConnection(em)
  const linkedBy = found?.linkedBy?.getEntity()
  return {
    kroger: {
      ready,
      location: found?.location ?? null,
      modality: modalityOf(found),
      linked:
        found?.account && found.linkedAt
          ? {
              by: linkedBy?.name ?? linkedBy?.displayUsername ?? null,
              at: found.linkedAt.toISOString(),
            }
          : null,
      needsRelink: Boolean(found?.account && found.broken),
      pricesCheckedAt: found?.pricesCheckedAt?.toISOString() ?? null,
      leanOnSales: await deps.settings.household(
        em,
        householdId,
        STORE_SETTINGS.leanOnSales
      ),
      weeklyBudget: await deps.settings.household(
        em,
        householdId,
        STORE_SETTINGS.weeklyBudget
      ),
    },
  }
}

/** Sets the household's Kroger store, or how its orders are collected. */
export async function setKrogerStore(
  deps: StoreDeps,
  em: EntityManager,
  householdId: string,
  changes: { locationId?: string; modality?: "PICKUP" | "DELIVERY" }
) {
  const app = await needKrogerApp(deps)
  const connection = await connectionOf(em, householdId)
  if (changes.locationId) {
    const before = connection.location?.locationId
    connection.location = await locationById(
      deps.fetcher,
      app,
      changes.locationId
    )
    // Another store: its prices and sales are looked at afresh.
    if (before !== changes.locationId) {
      connection.priceSearches = null
      connection.pricesCheckedAt = null
    }
  }
  if (changes.modality) connection.modality = changes.modality
  await em.flush()
  return storesStatus(deps, em, householdId)
}

const base64url = (bytes: Buffer) => bytes.toString("base64url")

/**
 * Starts linking a Kroger account: where to send the person, whose state
 * and PKCE verifier wait in the database for them to come back.
 */
export async function startKrogerLink(
  deps: StoreDeps,
  em: EntityManager,
  options: { householdId: string; userId: string; redirectUri: string }
) {
  const app = await needKrogerApp(deps)
  const connection = await connectionOf(em, options.householdId)
  const verifier = base64url(randomBytes(32))
  const state = base64url(randomBytes(24))
  connection.pendingState = state
  // The address it comes back to goes with it: Kroger asks for it again.
  connection.pendingVerifier = JSON.stringify({
    verifier,
    redirectUri: options.redirectUri,
  })
  connection.pendingUser = em.getReference(User, options.userId, {
    wrapped: true,
  })
  connection.pendingUntil = new Date(Date.now() + LINK_FOR_MS)
  await em.flush()
  return authorizeUrl(app, {
    redirectUri: options.redirectUri,
    state,
    challenge: base64url(createHash("sha256").update(verifier).digest()),
  })
}

/**
 * Finishes a link when the person comes back from Kroger: the tokens for
 * their account, sealed, for the household they started it in.
 */
export async function finishKrogerLink(
  deps: StoreDeps,
  em: EntityManager,
  options: { userId: string; state: string; code: string }
) {
  const app = await needKrogerApp(deps)
  const connection = await em.findOne(
    StoreConnection,
    { store: KROGER, pendingState: options.state },
    { ...ACROSS_HOUSEHOLDS, populate: ["account"] }
  )
  if (
    !connection ||
    connection.pendingUser?.id !== options.userId ||
    !connection.pendingVerifier ||
    !connection.pendingUntil ||
    connection.pendingUntil < new Date()
  ) {
    throw new AppError(
      "invalid",
      "kroger_link_expired",
      "That link to Kroger has run out. Start again from Settings, Household, Stores."
    )
  }
  const pending = JSON.parse(connection.pendingVerifier) as {
    verifier: string
    redirectUri: string
  }
  const tokens = await exchangeCode(deps.fetcher, app, {
    code: options.code,
    verifier: pending.verifier,
    redirectUri: pending.redirectUri,
  })
  await keepTokens(deps, em, connection, tokens)
  connection.linkedBy = em.getReference(User, options.userId, { wrapped: true })
  connection.linkedAt = new Date()
  connection.pendingState = null
  connection.pendingVerifier = null
  connection.pendingUser = null
  connection.pendingUntil = null
  await em.flush()
  return connection.household.id
}

async function keepTokens(
  deps: StoreDeps,
  em: EntityManager,
  connection: StoreConnection,
  tokens: { accessToken: string; refreshToken: string; expiresAt: Date }
) {
  const sealed = deps.settings.seal(
    JSON.stringify({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    })
  )
  const kept = connection.account?.getEntity()
  if (kept) Object.assign(kept, sealed)
  else connection.account = ref(em.create(Secret, sealed))
  connection.accessExpiresAt = tokens.expiresAt
  connection.broken = false
}

/** Unlinks the household's Kroger account. */
export async function unlinkKroger(em: EntityManager) {
  const connection = await em.findOne(
    StoreConnection,
    { store: KROGER },
    { populate: ["account"] }
  )
  if (!connection) return
  const secret = connection.account?.getEntity()
  connection.account = null
  connection.linkedAt = null
  connection.linkedBy = null
  connection.accessExpiresAt = null
  connection.broken = false
  if (secret) em.remove(secret)
  await em.flush()
}

/**
 * A token for the linked account's cart, made fresh when it's about to
 * run out. When Kroger won't refresh it, the link is marked broken.
 */
export async function accountToken(
  deps: StoreDeps,
  em: EntityManager,
  connection: StoreConnection
) {
  const app = await needKrogerApp(deps)
  await em.populate(connection, ["account"])
  const secret = connection.account?.getEntity()
  if (!secret || connection.broken) throw new KrogerSignInError()
  const tokens = JSON.parse(deps.settings.open(secret)) as {
    accessToken: string
    refreshToken: string
  }
  if (connection.accessExpiresAt && connection.accessExpiresAt > new Date()) {
    return tokens.accessToken
  }
  try {
    const fresh = await refreshTokens(deps.fetcher, app, tokens.refreshToken)
    await keepTokens(deps, em, connection, fresh)
    await em.flush()
    return fresh.accessToken
  } catch (err) {
    if (err instanceof KrogerSignInError) {
      connection.broken = true
      await em.flush()
    }
    throw err
  }
}

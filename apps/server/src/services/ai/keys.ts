import {
  KEYED_PROVIDERS,
  type AiKeyInfo,
  type AiProvider,
  type KeyedProvider,
} from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import type { AppDeps } from "../../core/context.ts"
import { AppError } from "../../core/errors.ts"
import { AiKey, Secret } from "../../database/entities/index.ts"
import { ENV_KEYS } from "../../modules/ai/settings.ts"
import { checkLink } from "../fetch/public-fetch.ts"
import { UnreadableSecretError } from "../secrets/secret-box.ts"
import {
  checkCredit,
  creditView,
  passedOver,
  setCredit,
  stateOf,
  type CreditCheck,
  type KeyState,
} from "./credit.ts"
import { listModels, type AiTarget } from "./providers.ts"
import { getPolicy } from "./policy.ts"

// AI keys and addresses: the server's own (some from its environment) and
// each household's. A key is tested against its provider before it's
// kept, kept sealed, and never sent back out: only its last four
// characters are shown.

type Deps = Pick<AppDeps, "settings" | "fetcher">

/** A key or an address as Settings shows it. */
export type AiKeyView = {
  id: string
  provider: AiProvider
  name: string | null
  baseUrl: string | null
  /** The key's last four characters. */
  hint: string | null
  /** What it can use, from its last test. */
  models: string[] | null
  testedAt: string | null
  /** Set in the server's environment, so it can't be changed here. */
  fromEnvironment: boolean
  /** Sealed with a master key the server no longer has: it needs entering again. */
  unreadable: boolean
  /** The credit entered for it, what's been spent since, and about what's left. */
  credit: { amount: number; since: string; spent: number; left: number } | null
  /** When its provider last said it's out of credit; none since it worked. */
  outOfCreditAt: string | null
  /** About a fifth or less of its credit left, by Merran's count. */
  lowOnCredit: boolean
  /** What a test or adding it found of its credit, with one tiny call. */
  creditCheck?: CreditCheck | null
}

/** A key to add: a provider's, or an address with a key or none. */
export type NewAiKey =
  | { provider: KeyedProvider; key: string }
  | {
      provider: "openai-compatible"
      name: string
      baseUrl: string
      key: string | null
    }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A key from the environment has an id like "env:anthropic". */
const envId = (provider: KeyedProvider) => `env:${provider}`

const hintOf = (key: string) => (key.length >= 12 ? key.slice(-4) : null)

const notFound = () =>
  new AppError("not_found", "ai_key_not_found", "There's no such key.")

/** The server's keys from its environment. */
async function envKeys(deps: Deps) {
  const found: { provider: KeyedProvider; key: string }[] = []
  for (const provider of KEYED_PROVIDERS) {
    const key = await deps.settings.server(ENV_KEYS[provider])
    if (key) found.push({ provider, key })
  }
  return found
}

/** The keys a household has, or with none, the server's own. */
async function rowsOf(em: EntityManager, householdId: string | null) {
  return em.find(
    AiKey,
    { household: householdId },
    { populate: ["secret"], orderBy: { createdAt: "asc" } }
  )
}

function readable(deps: Deps, row: AiKey) {
  const secret = row.secret?.getEntity()
  if (!secret) return true
  try {
    deps.settings.open(secret)
    return true
  } catch (error) {
    if (error instanceof UnreadableSecretError) return false
    throw error
  }
}

/** A key's credit as Settings shows it. */
async function creditOf(em: EntityManager, keyId: string, state: KeyState) {
  const view = await creditView(em, keyId, state)
  return {
    credit: view.credit,
    outOfCreditAt: state.outOfCreditAt?.toISOString() ?? null,
    lowOnCredit: view.lowOnCredit,
  }
}

async function describe(
  deps: Deps,
  em: EntityManager,
  row: AiKey
): Promise<AiKeyView> {
  return {
    id: row.id,
    provider: row.provider,
    name: row.name ?? null,
    baseUrl: row.baseUrl ?? null,
    hint: row.hint ?? null,
    models: row.models ?? null,
    testedAt: row.testedAt?.toISOString() ?? null,
    fromEnvironment: false,
    unreadable: !readable(deps, row),
    ...(await creditOf(em, row.id, {
      credit: row.credit == null ? null : Number(row.credit),
      creditSince: row.creditSince ?? null,
      outOfCreditAt: row.outOfCreditAt ?? null,
    })),
  }
}

/** The keys a household has added, or with none, the server's. */
export async function listKeys(
  deps: Deps,
  em: EntityManager,
  householdId: string | null
): Promise<AiKeyView[]> {
  const rows = await Promise.all(
    (await rowsOf(em, householdId)).map((row) => describe(deps, em, row))
  )
  if (householdId) return rows
  const fromEnv = await Promise.all(
    (await envKeys(deps)).map(
      async ({ provider, key }): Promise<AiKeyView> => ({
        id: envId(provider),
        provider,
        name: null,
        baseUrl: null,
        hint: hintOf(key),
        models: null,
        testedAt: null,
        fromEnvironment: true,
        unreadable: false,
        ...(await creditOf(
          em,
          envId(provider),
          await stateOf(deps, em, envId(provider))
        )),
      })
    )
  )
  // A key in the environment wins over one added for the same provider.
  const set = new Set(fromEnv.map((key) => key.provider))
  return [...fromEnv, ...rows.filter((row) => !set.has(row.provider))]
}

/**
 * The keys for choosing whose pays: readable ones, and addresses with
 * models, but not one out of credit within the hour.
 */
export async function keyInfos(
  deps: Deps,
  em: EntityManager,
  householdId: string | null
): Promise<AiKeyInfo[]> {
  return (await listKeys(deps, em, householdId))
    .filter(
      (key) =>
        !key.unreadable &&
        !passedOver({
          credit: null,
          creditSince: null,
          outOfCreditAt: key.outOfCreditAt ? new Date(key.outOfCreditAt) : null,
        })
    )
    .map((key) => ({
      id: key.id,
      source: householdId ? "household" : "server",
      provider: key.provider,
      models: key.provider === "openai-compatible" ? key.models : null,
    }))
}

/** Where a key's calls go: its provider, key and address. */
export async function targetOf(
  deps: Deps,
  em: EntityManager,
  keyId: string,
  model: string
): Promise<AiTarget> {
  const env = KEYED_PROVIDERS.find((provider) => envId(provider) === keyId)
  if (env) {
    return {
      provider: env,
      model,
      apiKey: (await deps.settings.server(ENV_KEYS[env])) ?? null,
      baseUrl: null,
      homeNetwork: false,
    }
  }
  if (!UUID.test(keyId)) throw notFound()
  const row = await em.findOne(AiKey, { id: keyId }, { populate: ["secret"] })
  if (!row) throw notFound()
  const secret = row.secret?.getEntity()
  return {
    provider: row.provider,
    model,
    apiKey: secret ? deps.settings.open(secret) : null,
    baseUrl: row.baseUrl ?? null,
    // The server's addresses were given by the server admin.
    homeNetwork: !row.household,
  }
}

/**
 * Adds a key, after testing it against its provider. A provider's key
 * replaces the one before it; there can be several addresses. Households
 * may add keys, or addresses, only if the server's AI policy lets them.
 */
export async function addKey(
  deps: Deps & Pick<AppDeps, "ai">,
  em: EntityManager,
  {
    householdId,
    userId,
    input,
  }: { householdId: string | null; userId: string; input: NewAiKey }
): Promise<AiKeyView> {
  const address = input.provider === "openai-compatible"
  if (householdId) {
    const policy = await getPolicy(deps.settings)
    if (address ? !policy.householdAddresses : !policy.householdKeys) {
      throw new AppError(
        "forbidden",
        address ? "ai_addresses_not_allowed" : "ai_keys_not_allowed",
        address
          ? "The server admin hasn't let households add addresses of their own."
          : "The server admin hasn't let households add keys of their own."
      )
    }
  }
  const homeNetwork = !householdId
  const baseUrl = address
    ? checkLink(input.baseUrl.trim(), { homeNetwork }).href.replace(/\/+$/, "")
    : null
  const key = input.key?.trim() || null
  const models = await listModels(deps.fetcher, {
    provider: input.provider,
    apiKey: key,
    baseUrl,
    homeNetwork,
  })

  const added = await em.transactional(async (tx) => {
    if (!address) {
      for (const old of await tx.find(
        AiKey,
        { household: householdId, provider: input.provider },
        { populate: ["secret"] }
      )) {
        await remove(tx, old)
      }
    }
    const row = tx.create(AiKey, {
      household: householdId,
      provider: input.provider,
      name: address ? input.name.trim() : null,
      baseUrl,
      secret: key ? tx.create(Secret, deps.settings.seal(key)) : null,
      hint: key ? hintOf(key) : null,
      models,
      testedAt: new Date(),
      createdBy: userId,
    })
    await tx.flush()
    return row.id
  })
  const creditCheck = await checkCredit(
    deps,
    em,
    added,
    { provider: input.provider, apiKey: key, baseUrl, homeNetwork },
    models
  )
  const row = await em.findOneOrFail(
    AiKey,
    { id: added },
    { populate: ["secret"], refresh: true }
  )
  return { ...(await describe(deps, em, row)), creditCheck }
}

async function remove(em: EntityManager, row: AiKey) {
  const secret = row.secret?.getEntity()
  em.remove(row)
  if (secret) em.remove(secret)
  await em.flush()
}

async function ownRow(
  em: EntityManager,
  householdId: string | null,
  keyId: string
) {
  if (!UUID.test(keyId)) throw notFound()
  const row = await em.findOne(
    AiKey,
    { id: keyId, household: householdId },
    { populate: ["secret"] }
  )
  if (!row) throw notFound()
  return row
}

/** Takes a key off. One from the environment can only be taken off there. */
export async function removeKey(
  em: EntityManager,
  householdId: string | null,
  keyId: string
) {
  if (keyId.startsWith("env:")) {
    throw new AppError(
      "conflict",
      "ai_key_from_environment",
      "That key is set in the server's environment, so it can only be taken off there."
    )
  }
  await remove(em, await ownRow(em, householdId, keyId))
}

/**
 * Notes the credit on one of a household's keys, or the server's, as its
 * provider's dashboard says it is now; null stops counting.
 */
export async function setKeyCredit(
  deps: Deps,
  em: EntityManager,
  householdId: string | null,
  keyId: string,
  amount: number | null
): Promise<AiKeyView> {
  if (!keyId.startsWith("env:")) await ownRow(em, householdId, keyId)
  const before = (await listKeys(deps, em, householdId)).find(
    (key) => key.id === keyId
  )
  if (!before) throw notFound()
  await setCredit(deps, em, keyId, amount)
  const row = keyId.startsWith("env:")
    ? null
    : await em.findOne(AiKey, { id: keyId })
  if (row) await em.refresh(row)
  return (await listKeys(deps, em, householdId)).find(
    (key) => key.id === keyId
  )!
}

/** Tests a key again, and notes what it can use now. */
export async function testKey(
  deps: Deps & Pick<AppDeps, "ai">,
  em: EntityManager,
  householdId: string | null,
  keyId: string
): Promise<AiKeyView> {
  const env = KEYED_PROVIDERS.find((provider) => envId(provider) === keyId)
  if (env && !householdId) {
    const target = await targetOf(deps, em, keyId, "")
    const models = await listModels(deps.fetcher, target)
    const creditCheck = await checkCredit(deps, em, keyId, target, models)
    const [view] = (await listKeys(deps, em, null)).filter(
      (key) => key.id === keyId
    )
    return {
      ...view!,
      models,
      testedAt: new Date().toISOString(),
      creditCheck,
    }
  }
  const row = await ownRow(em, householdId, keyId)
  if (!readable(deps, row)) {
    throw new AppError(
      "conflict",
      "ai_key_unreadable",
      "This key was sealed with a master key the server no longer has. Take it off and add it again."
    )
  }
  const target = await targetOf(deps, em, keyId, "")
  row.models = await listModels(deps.fetcher, target)
  row.testedAt = new Date()
  await em.flush()
  const creditCheck = await checkCredit(deps, em, keyId, target, row.models)
  await em.refresh(row)
  return { ...(await describe(deps, em, row)), creditCheck }
}

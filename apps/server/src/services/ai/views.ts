import {
  AI_MODELS,
  endpointRef,
  KEYED_PROVIDERS,
  modelRef,
  nearLimit,
  serverKeysCover,
  serverLimitFor,
  type KeySource,
} from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import type { AppDeps } from "../../core/context.ts"
import { Household } from "../../database/entities/index.ts"
import { HOUSEHOLD_FILTER } from "../../database/scope.ts"
import { listKeys, type AiKeyView } from "./keys.ts"
import { adminHouseholds, getPolicy } from "./policy.ts"
import { householdAi, householdAiStatus } from "./status.ts"
import { householdUsage, serverUsage, spentThisMonth } from "./usage.ts"

// What Settings shows of AI: the server's keys, policy and spend for the
// server admin; a household's keys, models, status and spend for it.

type Deps = Pick<AppDeps, "settings" | "fetcher">

/** A model to pick, from keys that can run it. */
export type ModelOption = {
  ref: string
  name: string
  size: "large" | "small" | null
  /** US dollars per million tokens, in and out; null when unknown or free. */
  price: [number, number] | null
  source: KeySource
}

/** The models some keys can run: the catalog's for each provider, an address's own. */
function optionsFor(keys: readonly AiKeyView[], source: KeySource) {
  const options: ModelOption[] = []
  for (const key of keys) {
    if (key.unreadable) continue
    if (key.provider === "openai-compatible") {
      for (const model of key.models ?? []) {
        options.push({
          ref: endpointRef(key.id, model),
          name: `${key.name ?? "Address"}: ${model}`,
          size: null,
          price: null,
          source,
        })
      }
      continue
    }
    for (const model of AI_MODELS.filter((m) => m.provider === key.provider)) {
      options.push({
        ref: modelRef(model.provider, model.id),
        name: model.name,
        size: model.size,
        price: model.price ? [model.price[0], model.price[1]] : null,
        source,
      })
    }
  }
  // Each provider once, its key in the environment or added.
  return options.filter(
    (option, index) =>
      options.findIndex((other) => other.ref === option.ref) === index
  )
}

/** Settings → This server → AI. */
export async function serverAi(deps: Deps, em: EntityManager) {
  const [keys, policy, usage, admins] = await Promise.all([
    listKeys(deps, em, null),
    getPolicy(deps.settings),
    serverUsage(em),
    adminHouseholds(em),
  ])
  const households = await em.find(
    Household,
    {},
    { orderBy: { name: "asc" }, filters: { [HOUSEHOLD_FILTER]: false } }
  )
  return {
    keys,
    policy,
    models: optionsFor(keys, "server"),
    providers: [...KEYED_PROVIDERS],
    households: await Promise.all(
      households.map(async (household) => {
        const limit = serverLimitFor(policy, household.id)
        const { server } = await spentThisMonth(em, household.id)
        return {
          id: household.id,
          name: household.name,
          covered: serverKeysCover(
            policy,
            household.id,
            admins.has(household.id)
          ),
          serverAdmin: admins.has(household.id),
          limit,
          spent: server,
          near: nearLimit(server, limit),
        }
      })
    ),
    usage: { months: usage.months, models: usage.models },
  }
}

/** Settings → Household → AI. */
export async function householdAiView(
  deps: Deps,
  em: EntityManager,
  householdId: string
) {
  const [status, own, server, settings, usage, policy] = await Promise.all([
    householdAiStatus(deps, em, householdId),
    listKeys(deps, em, householdId),
    listKeys(deps, em, null),
    householdAi(em, householdId),
    householdUsage(em, householdId),
    getPolicy(deps.settings),
  ])
  // The server's models it may use: none unless covered, and only those
  // the policy lets it.
  const shared = status.server.covers
    ? optionsFor(server, "server").filter(
        (option) =>
          policy.models.length === 0 || policy.models.includes(option.ref)
      )
    : []
  return {
    status,
    keys: own,
    settings,
    models: [...optionsFor(own, "household"), ...shared],
    usage,
  }
}

import {
  AI_TASKS,
  NO_HOUSEHOLD_AI,
  nearLimit,
  resolveAi,
  serverLimitFor,
  type AiProvider,
  type AiTask,
  type HouseholdAi,
  type Resolution,
} from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import type { AppDeps } from "../../core/context.ts"
import { Household } from "../../database/entities/index.ts"
import { HOUSEHOLD_FILTER } from "../../database/scope.ts"
import { keyInfos, listKeys } from "./keys.ts"
import { coversHousehold, getPolicy } from "./policy.ts"
import { spentThisMonth } from "./usage.ts"

// Whose key pays for each of a household's AI tasks, and how its spend
// stands against its limits.

type Deps = Pick<AppDeps, "settings" | "fetcher">

/** What a household picked, its models and its own limit. */
export async function householdAi(
  em: EntityManager,
  householdId: string
): Promise<HouseholdAi> {
  const household = await em.findOneOrFail(
    Household,
    { id: householdId },
    { filters: { [HOUSEHOLD_FILTER]: false } }
  )
  return { ...NO_HOUSEHOLD_AI, ...household.settings?.ai }
}

export async function saveHouseholdAi(
  em: EntityManager,
  householdId: string,
  ai: HouseholdAi
) {
  const household = await em.findOneOrFail(
    Household,
    { id: householdId },
    { filters: { [HOUSEHOLD_FILTER]: false } }
  )
  household.settings = { ...household.settings, ai }
  await em.flush()
}

/** Everything that decides whose key pays, for a household. */
async function contextFor(deps: Deps, em: EntityManager, householdId: string) {
  const [policy, ai, spent, own, server] = await Promise.all([
    getPolicy(deps.settings),
    householdAi(em, householdId),
    spentThisMonth(em, householdId),
    keyInfos(deps, em, householdId),
    keyInfos(deps, em, null),
  ])
  const covers = await coversHousehold(em, policy, householdId)
  return { policy, ai, spent, own, server, covers }
}

/**
 * A key from one of these providers, from whoever pays for one of a
 * household's AI tasks, or null: for what only some providers can do,
 * like speech to text or pictures.
 */
export async function keyFrom(
  deps: Deps,
  em: EntityManager,
  options: {
    householdId: string
    task: AiTask
    providers: readonly AiProvider[]
    /** About what it'll cost, in US dollars, for the monthly limits. */
    estimate?: number
  }
) {
  const paying = await resolveTask(
    deps,
    em,
    options.householdId,
    options.task,
    options.estimate
  )
  if (!paying.ok) return null
  const context = await contextFor(deps, em, options.householdId)
  const pool =
    paying.key.source === "household"
      ? context.own
      : context.covers
        ? context.server
        : []
  return pool.find((key) => options.providers.includes(key.provider)) ?? null
}

/**
 * An OpenAI key that can turn a video's speech into text for a household:
 * from whoever pays for its importing, or null.
 */
export async function canTranscribe(
  deps: Deps,
  em: EntityManager,
  householdId: string
) {
  return keyFrom(deps, em, {
    householdId,
    task: "import",
    providers: ["openai"],
  })
}

/** Whose key pays for one of a household's AI tasks, or why nobody's can. */
export async function resolveTask(
  deps: Deps,
  em: EntityManager,
  householdId: string,
  task: AiTask,
  estimate = 0
): Promise<Resolution> {
  const context = await contextFor(deps, em, householdId)
  return resolveAi({
    task,
    householdId,
    household: {
      keys: context.own,
      ai: context.ai,
      spent: context.spent.household,
    },
    server: {
      keys: context.server,
      covers: context.covers,
      spent: context.spent.server,
    },
    policy: context.policy,
    estimate,
  })
}

/**
 * A household's AI as Settings and Today show it: for each task, which
 * model and whose key, or why none; and this month's spend against the
 * limits, warning near them.
 */
export async function householdAiStatus(
  deps: Deps,
  em: EntityManager,
  householdId: string
) {
  const context = await contextFor(deps, em, householdId)
  const tasks = Object.fromEntries(
    AI_TASKS.map((task) => {
      const resolution = resolveAi({
        task,
        householdId,
        household: {
          keys: context.own,
          ai: context.ai,
          spent: context.spent.household,
        },
        server: {
          keys: context.server,
          covers: context.covers,
          spent: context.spent.server,
        },
        policy: context.policy,
      })
      return [
        task,
        resolution.ok
          ? {
              ok: true as const,
              ref: resolution.ref,
              source: resolution.key.source,
            }
          : { ok: false as const, why: resolution.why },
      ]
    })
  ) as Record<
    AiTask,
    | { ok: true; ref: string; source: "server" | "household" }
    | { ok: false; why: Exclude<Resolution, { ok: true }>["why"] }
  >
  const serverLimit = serverLimitFor(context.policy, householdId)
  const ownLimit = context.ai.monthlyLimit
  // The keys it relies on that are out of credit, or running low.
  const [ownKeys, serverKeys] = await Promise.all([
    listKeys(deps, em, householdId),
    context.covers ? listKeys(deps, em, null) : [],
  ])
  const keyAlerts = [
    ...ownKeys.map((key) => ({ key, source: "household" as const })),
    ...serverKeys.map((key) => ({ key, source: "server" as const })),
  ]
    .filter(({ key }) => key.outOfCreditAt || key.lowOnCredit)
    .map(({ key, source }) => ({
      id: key.id,
      source,
      provider: key.provider,
      name: key.name,
      outOfCredit: key.outOfCreditAt !== null,
      left: key.credit?.left ?? null,
    }))
  return {
    available: Object.values(tasks).some((task) => task.ok),
    tasks,
    month: context.spent.month,
    server: {
      covers: context.covers,
      hasKeys: context.server.length > 0,
      limit: serverLimit,
      spent: context.spent.server,
      near: context.covers && nearLimit(context.spent.server, serverLimit),
    },
    own: {
      limit: ownLimit,
      spent: context.spent.household,
      near: nearLimit(context.spent.household, ownLimit),
    },
    mayAddKeys: context.policy.householdKeys,
    mayAddAddresses: context.policy.householdAddresses,
    keyAlerts,
  }
}

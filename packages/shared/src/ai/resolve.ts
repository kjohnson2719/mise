import {
  DEFAULT_MODELS,
  endpointRef,
  modelRef,
  parseModelRef,
  TASK_SIZES,
  type AiProvider,
  type AiTask,
  type ModelRef,
} from "./catalog.ts"
import { serverLimitFor, type AiPolicy, type HouseholdAi } from "./policy.ts"

// Whose key pays for an AI call: the household's own key for the task's
// model, if it has one; otherwise the server's, if the household may use
// it and is under its limit; otherwise the feature says what's missing.

export type KeySource = "server" | "household"

/** A key or an address, as the choice sees it: no secret in it. */
export type AiKeyInfo = {
  id: string
  source: KeySource
  provider: AiProvider
  /** An address's models, from its last test; null for a keyed provider. */
  models: string[] | null
}

/** Why there's no AI for a task, for the feature to say how to fix it. */
export type Unavailable =
  /** No key, of the household's or the server's, for any model it could use. */
  | "noKey"
  /** The server's keys don't cover this household, task or model. */
  | "notCovered"
  /** This month's limit on the server's keys is reached. */
  | "overLimit"
  /** This month's limit on the household's own keys is reached. */
  | "ownLimit"

export type Resolution =
  | { ok: true; key: AiKeyInfo; ref: ModelRef; model: string }
  | { ok: false; why: Unavailable }

export type ResolveInput = {
  task: AiTask
  householdId: string
  /** The household's own keys and addresses, what it picked, and this month's spend on them. */
  household: { keys: readonly AiKeyInfo[]; ai: HouseholdAi; spent: number }
  /**
   * The server's keys and shared addresses, whether they cover this
   * household, and what it's spent on them this month.
   */
  server: { keys: readonly AiKeyInfo[]; covers: boolean; spent: number }
  policy: AiPolicy
  /** A rough cost of the call, in US dollars, checked against the limits first. */
  estimate?: number
}

/** A key's own model for a size: its provider's default, or an address's first. */
function defaultRef(key: AiKeyInfo, size: "large" | "small"): ModelRef | null {
  if (key.provider === "openai-compatible") {
    const first = key.models?.[0]
    return first ? endpointRef(key.id, first) : null
  }
  return modelRef(key.provider, DEFAULT_MODELS[key.provider][size])
}

/** Whether a key can run a model. */
function runs(key: AiKeyInfo, ref: ModelRef) {
  const parsed = parseModelRef(ref)
  if (!parsed) return false
  return parsed.kind === "endpoint"
    ? key.provider === "openai-compatible" && key.id === parsed.endpoint
    : key.provider === parsed.provider
}

/** The reasons, the most telling first. */
const TELLING: readonly Unavailable[] = [
  "overLimit",
  "ownLimit",
  "notCovered",
  "noKey",
]

export function resolveAi(input: ResolveInput): Resolution {
  const { task, household, server, policy } = input
  const estimate = input.estimate ?? 0
  const size = TASK_SIZES[task]
  const picked = household.ai.tasks[task] ?? household.ai[size]
  // Nothing picked: the household's own keys first, then the server's.
  const candidates = picked
    ? [picked]
    : [
        ...household.keys.map((key) => defaultRef(key, size)),
        policy[size],
        ...server.keys.map((key) => defaultRef(key, size)),
      ]
  const refs = [
    ...new Set(candidates.filter((ref): ref is ModelRef => Boolean(ref))),
  ]

  const reasons = new Set<Unavailable>()
  for (const ref of refs) {
    const model = parseModelRef(ref)?.model
    if (!model) continue
    const own = household.keys.find((key) => runs(key, ref))
    if (own) {
      const limit = household.ai.monthlyLimit
      if (limit === null || household.spent + estimate <= limit) {
        return { ok: true, key: own, ref, model }
      }
      reasons.add("ownLimit")
    }
    const shared = server.keys.find((key) => runs(key, ref))
    if (!shared) {
      if (!own) reasons.add("noKey")
      continue
    }
    if (
      !server.covers ||
      !policy.tasks.includes(task) ||
      (policy.models.length > 0 && !policy.models.includes(ref))
    ) {
      reasons.add("notCovered")
      continue
    }
    const limit = serverLimitFor(policy, input.householdId)
    if (limit !== null && server.spent + estimate > limit) {
      reasons.add("overLimit")
      continue
    }
    return { ok: true, key: shared, ref, model }
  }
  return {
    ok: false,
    why: TELLING.find((why) => reasons.has(why)) ?? "noKey",
  }
}

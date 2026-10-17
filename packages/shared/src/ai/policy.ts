import { AI_TASKS, type AiTask, type ModelRef } from "./catalog.ts"

// Who may use the server's AI keys, set by the server admin, and what a
// household picks for itself. The person running the server doesn't have
// to pay for everyone they share it with.

/** Whose households the server's keys cover. */
export const SERVER_KEYS_FOR = ["admins", "chosen", "all", "none"] as const
export type ServerKeysFor = (typeof SERVER_KEYS_FOR)[number]

export type AiPolicy = {
  /**
   * The households the server's keys cover: those a server admin is in,
   * chosen ones, every one, or none.
   */
  serverKeysFor: ServerKeysFor
  /** The households chosen, when it's chosen ones. */
  households: string[]
  /** Each household's monthly limit on the server's keys, in US dollars; null for none. */
  monthlyLimit: number | null
  /** A limit for a household of its own, instead of the one above. */
  limits: Record<string, number>
  /** The tasks the server's keys cover. */
  tasks: AiTask[]
  /** The models the server's keys cover; none listed means any. */
  models: ModelRef[]
  /** Whether households may add keys of their own. */
  householdKeys: boolean
  /**
   * Whether households may add OpenAI-compatible addresses of their own.
   * Off at first: the server would call an address someone else picked.
   * Private-network addresses are refused even when it's on.
   */
  householdAddresses: boolean
  /** The models households use when they haven't picked, on the server's keys. */
  large: ModelRef | null
  small: ModelRef | null
}

/**
 * A fresh install: the server's keys cover the server admins' own
 * households only, with no limit; other households bring their own keys.
 */
export const DEFAULT_AI_POLICY: AiPolicy = {
  serverKeysFor: "admins",
  households: [],
  monthlyLimit: null,
  limits: {},
  tasks: [...AI_TASKS],
  models: [],
  householdKeys: true,
  householdAddresses: false,
  large: null,
  small: null,
}

/** What a household picks for itself, in Settings → Household → AI. */
export type HouseholdAi = {
  /** Its models for big and small tasks; null to go by its keys, or the server's. */
  large: ModelRef | null
  small: ModelRef | null
  /** A model for a task of its own. */
  tasks: Partial<Record<AiTask, ModelRef>>
  /** A monthly limit on its own keys, in US dollars; null for none. */
  monthlyLimit: number | null
  /** Tidy up each recipe it imports, with the suggestions left in Review. */
  autoTidy: boolean
}

export const NO_HOUSEHOLD_AI: HouseholdAi = {
  large: null,
  small: null,
  tasks: {},
  monthlyLimit: null,
  autoTidy: false,
}

/**
 * Whether the server's keys cover a household, by the policy: `admins` is
 * whether a server admin is in it.
 */
export function serverKeysCover(
  policy: Pick<AiPolicy, "serverKeysFor" | "households">,
  householdId: string,
  hasServerAdmin: boolean
) {
  switch (policy.serverKeysFor) {
    case "all":
      return true
    case "none":
      return false
    case "admins":
      return hasServerAdmin
    case "chosen":
      return policy.households.includes(householdId)
  }
}

/** A household's monthly limit on the server's keys; null for none. */
export const serverLimitFor = (
  policy: Pick<AiPolicy, "monthlyLimit" | "limits">,
  householdId: string
) => policy.limits[householdId] ?? policy.monthlyLimit

/** Near its limit: a household is warned at 80% of it. */
export const nearLimit = (spent: number, limit: number | null) =>
  limit !== null && spent >= limit * 0.8

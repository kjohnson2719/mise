import {
  DEFAULT_AI_POLICY,
  serverKeysCover,
  type AiPolicy,
} from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import type { AppDeps } from "../../core/context.ts"
import { Household, HouseholdMember } from "../../database/entities/index.ts"
import { HOUSEHOLD_FILTER } from "../../database/scope.ts"
import { AI } from "../../modules/ai/settings.ts"

// The server admin's AI policy: who may use the server's keys, and how
// much. A fresh install's covers the server admins' own households only.

export async function getPolicy(
  settings: AppDeps["settings"]
): Promise<AiPolicy> {
  // Fields added later start as their defaults.
  return { ...DEFAULT_AI_POLICY, ...(await settings.server(AI.policy)) }
}

/** Saves the policy, dropping any households that are gone. */
export async function savePolicy(
  deps: Pick<AppDeps, "settings">,
  em: EntityManager,
  input: AiPolicy
): Promise<AiPolicy> {
  const named = [...input.households, ...Object.keys(input.limits)]
  const existing = new Set(
    named.length > 0
      ? (await em.find(Household, { id: { $in: named } })).map((h) => h.id)
      : []
  )
  const policy: AiPolicy = {
    ...input,
    households: [...new Set(input.households)].filter((id) => existing.has(id)),
    limits: Object.fromEntries(
      Object.entries(input.limits).filter(([id]) => existing.has(id))
    ),
  }
  await deps.settings.keepServer(em, AI.policy, policy)
  return policy
}

/** The households a server admin is in. */
export async function adminHouseholds(em: EntityManager) {
  const members = await em.find(
    HouseholdMember,
    { user: { role: "admin" } },
    { filters: { [HOUSEHOLD_FILTER]: false } }
  )
  return new Set(members.map((member) => member.household.id))
}

/** Whether the server's keys cover a household. */
export async function coversHousehold(
  em: EntityManager,
  policy: AiPolicy,
  householdId: string
) {
  const admins =
    policy.serverKeysFor === "admins" ? await adminHouseholds(em) : new Set()
  return serverKeysCover(policy, householdId, admins.has(householdId))
}

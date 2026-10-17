import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { AI_PROVIDERS } from "@merran/shared"
import { householdFilter } from "../scope.ts"
import { createdAt, id } from "./base.ts"
import { householdRef } from "./households.ts"
import { User } from "./users.ts"

/** Whose key paid: the server's, or the household's own. */
export const AI_KEY_SOURCES = ["server", "household"] as const

/**
 * One AI call: whose it was, for what, on which model and whose key, and
 * what it took and cost. A model with no known price has no cost.
 */
export const AiUsage = defineEntity({
  name: "AiUsage",
  tableName: "ai_usage",
  properties: {
    id: id(),
    household: () => householdRef(),
    /** Who asked; none for background work. */
    user: () => p.manyToOne(User).ref().nullable().deleteRule("set null"),
    task: p.string(),
    provider: p.enum(AI_PROVIDERS),
    model: p.string(),
    source: p.enum(AI_KEY_SOURCES),
    /** The key that paid: an ai_keys id, or "env:anthropic" and the like. */
    key: p.string().nullable().index(),
    /** "2026-10": the month it counts towards, by the household's own days. */
    month: p.string(),
    inputTokens: p.integer(),
    outputTokens: p.integer(),
    /** In US dollars. */
    cost: p.double().nullable(),
    createdAt: createdAt(),
  },
  indexes: [{ properties: ["household", "month"] }, { properties: ["month"] }],
  filters: householdFilter,
})
export type AiUsage = InferEntity<typeof AiUsage>

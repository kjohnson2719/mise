import {
  clockIn,
  costOf,
  monthOf,
  type AiProvider,
  type AiTask,
  type KeySource,
} from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { AiUsage, Household, User } from "../../database/entities/index.ts"
import { HOUSEHOLD_FILTER } from "../../database/scope.ts"

// What AI calls took and cost: for limits, and for Settings to say who
// spent what on whose key.

/** How many months back Settings shows. */
const MONTHS = 6

/** This month for a household, "2026-10", by its own days. */
export async function monthFor(em: EntityManager, householdId: string) {
  const household = await em.findOneOrFail(
    Household,
    { id: householdId },
    { filters: { [HOUSEHOLD_FILTER]: false } }
  )
  return monthOf(clockIn(household.timeZone).today)
}

/** The months to show, this one first. */
function monthsBack(month: string, count = MONTHS) {
  const [year, number] = month.split("-").map(Number) as [number, number]
  return Array.from({ length: count }, (_, back) => {
    const date = new Date(Date.UTC(year, number - 1 - back, 1))
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
  })
}

export async function recordUsage(
  em: EntityManager,
  call: {
    householdId: string
    userId: string | null
    task: AiTask
    provider: AiProvider
    model: string
    source: KeySource
    /** The key that paid. */
    keyId: string
    inputTokens: number
    outputTokens: number
    /** What it cost, for a call not priced by tokens, like speech to text. */
    cost?: number
  }
) {
  em.create(AiUsage, {
    household: call.householdId,
    user: call.userId,
    task: call.task,
    provider: call.provider,
    model: call.model,
    source: call.source,
    key: call.keyId,
    month: await monthFor(em, call.householdId),
    inputTokens: call.inputTokens,
    outputTokens: call.outputTokens,
    cost:
      call.cost ??
      costOf(call.provider, call.model, call.inputTokens, call.outputTokens),
  })
  await em.flush()
}

/** Costs add up; a double can come back from the database as a string. */
const sum = (rows: readonly { cost?: number | string | null }[]) =>
  rows.reduce((total, row) => total + Number(row.cost ?? 0), 0)

/** What a household spent this month, on the server's keys and on its own. */
export async function spentThisMonth(em: EntityManager, householdId: string) {
  const month = await monthFor(em, householdId)
  const rows = await em.find(
    AiUsage,
    { household: householdId, month },
    { fields: ["source", "cost"], filters: { [HOUSEHOLD_FILTER]: false } }
  )
  return {
    month,
    server: sum(rows.filter((row) => row.source === "server")),
    household: sum(rows.filter((row) => row.source === "household")),
  }
}

/**
 * A household's spend: by month, on whose key; and this month by task and
 * by person.
 */
export async function householdUsage(em: EntityManager, householdId: string) {
  const months = monthsBack(await monthFor(em, householdId))
  const rows = await em.find(
    AiUsage,
    { household: householdId, month: { $in: months } },
    { filters: { [HOUSEHOLD_FILTER]: false } }
  )
  const now = rows.filter((row) => row.month === months[0])
  const people = new Map<string, typeof now>()
  for (const row of now) {
    const id = row.user?.id ?? ""
    people.set(id, [...(people.get(id) ?? []), row])
  }
  const names = new Map(
    (
      await em.find(User, {
        id: { $in: [...people.keys()].filter(Boolean) },
      })
    ).map((user) => [user.id, user.name])
  )
  const tasks = [...new Set(now.map((row) => row.task))]
  return {
    months: months.map((month) => {
      const inMonth = rows.filter((row) => row.month === month)
      return {
        month,
        server: sum(inMonth.filter((row) => row.source === "server")),
        household: sum(inMonth.filter((row) => row.source === "household")),
        calls: inMonth.length,
      }
    }),
    tasks: tasks
      .map((task) => {
        const of = now.filter((row) => row.task === task)
        return { task, cost: sum(of), calls: of.length }
      })
      .sort((a, b) => b.cost - a.cost),
    people: [...people]
      .map(([id, of]) => ({
        userId: id || null,
        name: id ? (names.get(id) ?? null) : null,
        cost: sum(of),
        calls: of.length,
      }))
      .sort((a, b) => b.cost - a.cost),
  }
}

/**
 * Spend on the server's keys: by month, and this month by household and by
 * model. Months are each household's own; the server's month is UTC's.
 */
export async function serverUsage(em: EntityManager) {
  const months = monthsBack(monthOf(new Date().toISOString().slice(0, 10)))
  const rows = await em.find(
    AiUsage,
    { source: "server", month: { $in: months } },
    { filters: { [HOUSEHOLD_FILTER]: false } }
  )
  const now = rows.filter((row) => row.month === months[0])
  const byHousehold = new Map<string, number>()
  for (const row of now) {
    const id = row.household.id
    byHousehold.set(id, (byHousehold.get(id) ?? 0) + Number(row.cost ?? 0))
  }
  const models = [...new Set(now.map((row) => `${row.provider} ${row.model}`))]
  return {
    months: months.map((month) => {
      const inMonth = rows.filter((row) => row.month === month)
      return { month, cost: sum(inMonth), calls: inMonth.length }
    }),
    byHousehold,
    models: models
      .map((both) => {
        const of = now.filter((row) => `${row.provider} ${row.model}` === both)
        return {
          provider: of[0]!.provider,
          model: of[0]!.model,
          cost: sum(of),
          calls: of.length,
        }
      })
      .sort((a, b) => b.cost - a.cost),
  }
}

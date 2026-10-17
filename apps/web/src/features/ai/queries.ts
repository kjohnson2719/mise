import { queryOptions } from "@tanstack/react-query"

import { api, unwrap, type Schemas } from "@/lib/api/client"

export type AiKey = Schemas["AiKey"]
export type NewAiKey = Schemas["NewAiKey"]
export type AiPolicy = Schemas["AiPolicy"]
export type HouseholdAiSettings = Schemas["HouseholdAiSettings"]
/** A model to pick: the server's and a household's answers describe it alike. */
export type ModelOption = {
  ref: string
  name: string
  size: "large" | "small" | null
  /** US dollars per million tokens, in and out. */
  price: readonly number[] | null
  source: "server" | "household"
}

const fetchServerAi = () => unwrap(api.GET("/api/settings/server/ai"))
const fetchHouseholdAi = () => unwrap(api.GET("/api/households/current/ai"))

export type ServerAi = Awaited<ReturnType<typeof fetchServerAi>>
export type HouseholdAi = Awaited<ReturnType<typeof fetchHouseholdAi>>

/** The server's AI keys, policy and spend: the server admin's. */
export const serverAiQuery = queryOptions({
  queryKey: ["settings", "server", "ai"],
  queryFn: fetchServerAi,
})

/** The household's AI: whose key pays, its own keys and models, its spend. */
export const householdAiQuery = queryOptions({
  queryKey: ["household", "ai"],
  queryFn: fetchHouseholdAi,
})

/** "$1.24", or "under 1¢" for a sliver of a cent. */
export function formatMoney(dollars: number, language: string) {
  if (dollars > 0 && dollars < 0.005) {
    return `< ${new Intl.NumberFormat(language, { style: "currency", currency: "USD" }).format(0.01)}`
  }
  return new Intl.NumberFormat(language, {
    style: "currency",
    currency: "USD",
  }).format(dollars)
}

/** "October 2026" for "2026-10". */
export function formatMonth(month: string, language: string) {
  return new Intl.DateTimeFormat(language, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T12:00:00Z`))
}

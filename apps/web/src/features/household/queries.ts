import { queryOptions } from "@tanstack/react-query"

import { api, unwrap, type Schemas } from "@/lib/api/client"

export type Household = Schemas["Household"]
export type Member = Schemas["Member"]
export type InviteLink = Schemas["InviteLink"]
export type HouseholdRole = Household["role"]

export const householdQuery = queryOptions({
  queryKey: ["household"],
  queryFn: () => unwrap(api.GET("/api/households/current")),
})

export const membersQuery = queryOptions({
  queryKey: ["household", "members"],
  queryFn: () => unwrap(api.GET("/api/households/current/members")),
})

/** What the household eats and doesn't, which Fill the week keeps to. */
export const tastesQuery = queryOptions({
  queryKey: ["household", "tastes"],
  queryFn: () => unwrap(api.GET("/api/households/current/tastes")),
})

/** Dinner's theme each weekday, Sunday first. */
export const themesQuery = queryOptions({
  queryKey: ["household", "themes"],
  queryFn: () => unwrap(api.GET("/api/households/current/themes")),
})

export const invitesQuery = queryOptions({
  queryKey: ["household", "invites"],
  queryFn: () => unwrap(api.GET("/api/households/current/invites")),
})

export function isAdminRole(role: HouseholdRole | undefined) {
  return role === "owner" || role === "admin"
}

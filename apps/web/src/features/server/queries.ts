import { queryOptions, useQueryClient } from "@tanstack/react-query"

import { capabilitiesQuery } from "@/features/capabilities/queries"
import { api, unwrap, type Schemas } from "@/lib/api/client"

export type ServerSettings = Schemas["ServerSettings"]
export type TelemetryReport = Schemas["TelemetryReport"]

export const serverSettingsQuery = queryOptions({
  queryKey: ["settings", "server"],
  queryFn: () => unwrap(api.GET("/api/settings/server")),
})

export const telemetryReportQuery = queryOptions({
  queryKey: ["telemetry", "report"],
  queryFn: () => unwrap(api.GET("/api/telemetry/report")),
})

/** Saves server settings, then refreshes everything they change. */
export function useSaveServerSettings() {
  const queryClient = useQueryClient()
  return async (changes: Record<string, unknown>) => {
    const saved = await unwrap(
      api.PATCH("/api/settings/server", { body: changes })
    )
    queryClient.setQueryData(serverSettingsQuery.queryKey, saved)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: capabilitiesQuery.queryKey }),
      queryClient.invalidateQueries({
        queryKey: telemetryReportQuery.queryKey,
      }),
    ])
    return saved
  }
}

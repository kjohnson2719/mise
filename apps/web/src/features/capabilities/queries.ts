import { queryOptions, useQuery } from "@tanstack/react-query"

import { api, unwrap, type Schemas } from "@/lib/api/client"

export type Capabilities = Schemas["Capabilities"]

/**
 * Which of Merran's optional parts are on. The app shows only what's on,
 * and says what's missing for the rest.
 */
export const capabilitiesQuery = queryOptions({
  queryKey: ["capabilities"],
  queryFn: () => unwrap(api.GET("/api/capabilities")),
  staleTime: 5 * 60_000,
})

/** Whether something optional, like "ai.chat", can be offered right now. */
export function useCapability(name: string): boolean {
  const { data } = useQuery(capabilitiesQuery)
  return data?.capabilities.includes(name) ?? false
}

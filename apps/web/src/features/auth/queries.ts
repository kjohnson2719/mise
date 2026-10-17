import { queryOptions } from "@tanstack/react-query"
import { api, ApiError, unwrap, type Schemas } from "@/lib/api/client"

export type Me = Schemas["Me"]

/** Who's signed in, or null when nobody is. */
export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async (): Promise<Me | null> => {
    try {
      return await unwrap(api.GET("/api/auth/me"))
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null
      throw error
    }
  },
})

/** Whether the server still needs its first account. */
export const setupQuery = queryOptions({
  queryKey: ["setup"],
  queryFn: () => unwrap(api.GET("/api/auth/setup")),
})

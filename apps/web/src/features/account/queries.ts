import { queryOptions } from "@tanstack/react-query"

import { api, unwrap, type Schemas } from "@/lib/api/client"

export type ApiKey = Schemas["ApiKey"]
export type ApiKeyPermissions = Schemas["ApiKeyPermissions"]

export const apiKeysQuery = queryOptions({
  queryKey: ["api-keys"],
  queryFn: () => unwrap(api.GET("/api/auth/api-keys")),
})

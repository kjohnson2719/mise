import { queryOptions } from "@tanstack/react-query"

import { api, unwrap } from "@/lib/api/client"

// What Today shows of the recipes. Under "recipes", so changes to them
// fetch these again.

/** What was added lately, and how many recipes there are in all. */
export const recentRecipesQuery = queryOptions({
  queryKey: ["recipes", "today", "recent"],
  queryFn: () =>
    unwrap(
      api.GET("/api/recipes", {
        params: { query: { sort: "newest", limit: 6 } },
      })
    ),
})

/** The best rated, to find favorites not made lately among. */
export const topRatedQuery = queryOptions({
  queryKey: ["recipes", "today", "top"],
  queryFn: () =>
    unwrap(
      api.GET("/api/recipes", {
        params: { query: { sort: "rating", limit: 48 } },
      })
    ),
})

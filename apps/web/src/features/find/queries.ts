import { queryOptions, useQueryClient } from "@tanstack/react-query"

import { api, unwrap, type Schemas } from "@/lib/api/client"

export type ShelfRecipe = Schemas["ShelfRecipe"]
export type FollowedSite = Schemas["FollowedSite"]
export type CollectionSummary = Schemas["CollectionSummary"]
export type Collection = Schemas["Collection"]

// Under ["recipes"], so live updates and imports refresh them too.

export const sitesQuery = queryOptions({
  queryKey: ["recipes", "sites"],
  queryFn: () => unwrap(api.GET("/api/sites")),
  // While a site's being read for the first time, look again soon.
  refetchInterval: (query) =>
    query.state.data?.sites.some((site) => site.reading || site.waiting > 0)
      ? 5000
      : false,
})

export const siteRecipesQuery = queryOptions({
  queryKey: ["recipes", "sites", "recipes"],
  queryFn: () => unwrap(api.GET("/api/sites/recipes")),
  staleTime: 5 * 60_000,
})

export const collectionsQuery = queryOptions({
  queryKey: ["recipes", "collections"],
  queryFn: () => unwrap(api.GET("/api/collections")),
})

export const collectionQuery = (id: string) =>
  queryOptions({
    queryKey: ["recipes", "collections", id],
    queryFn: () =>
      unwrap(
        api.GET("/api/collections/{collection}", {
          params: { path: { collection: id } },
        })
      ),
    refetchInterval: (query) =>
      query.state.data?.found?.status === "searching" ? 2000 : false,
  })

/** Refreshes everything from the recipe sites. */
export function useRefreshSites() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["recipes", "sites"] }),
      queryClient.invalidateQueries({ queryKey: ["recipes", "collections"] }),
    ])
}

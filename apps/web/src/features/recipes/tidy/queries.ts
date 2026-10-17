import {
  queryOptions,
  useInfiniteQuery,
  useQueryClient,
} from "@tanstack/react-query"

import { api, unwrap, type Schemas } from "@/lib/api/client"

export type Proposal = Schemas["Proposal"]
export type TidySection = Schemas["TidySection"]
export type ProposalSection = Schemas["ProposalSection"]
export type TidyRun = Schemas["TidyRun"]
export type TidyValues = Schemas["TidyValues"]

const isGoing = (run: TidyRun) =>
  run.status === "queued" || run.status === "running"

/** The household's tidy up runs, checked often while one is going. */
export const tidyRunsQuery = queryOptions({
  queryKey: ["review", "runs"],
  queryFn: () => unwrap(api.GET("/api/recipes/tidy")),
  refetchInterval: (query) =>
    query.state.data?.runs.some(isGoing) ? 2000 : false,
})

/** The run going, if there is one. */
export const runGoing = (runs: readonly TidyRun[] | undefined) =>
  runs?.find(isGoing)

/** How many suggestions are waiting: the first page's total. */
export const reviewCountQuery = queryOptions({
  queryKey: ["review", "proposals", "count"],
  queryFn: () =>
    unwrap(api.GET("/api/proposals", { params: { query: { limit: 1 } } })),
  select: (data) => data.total,
})

const PAGE = 20

/** The Review queue, a page at a time. */
export function useProposals() {
  return useInfiniteQuery({
    queryKey: ["review", "proposals", "list"],
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET("/api/proposals", {
          params: { query: { limit: PAGE, offset: pageParam } },
        })
      ),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const shown = pages.reduce((n, page) => n + page.proposals.length, 0)
      return shown < last.total ? shown : undefined
    },
  })
}

/** A recipe's waiting tidy up. */
export const recipeTidyQuery = (recipeId: string) =>
  queryOptions({
    queryKey: ["review", "recipe", recipeId],
    queryFn: () =>
      unwrap(
        api.GET("/api/recipes/{recipe}/tidy", {
          params: { path: { recipe: recipeId } },
        })
      ),
  })

/** What's waiting for one recipe: tidy ups and cooking notes' changes. */
export const recipeProposalsQuery = (recipeId: string) =>
  queryOptions({
    queryKey: ["review", "recipe", recipeId, "all"],
    queryFn: () =>
      unwrap(
        api.GET("/api/proposals", {
          params: { query: { recipe: recipeId } },
        })
      ),
  })

/** Everything Review shows, after something's applied or dismissed. */
export function useRefreshReview() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ["review"] })
}

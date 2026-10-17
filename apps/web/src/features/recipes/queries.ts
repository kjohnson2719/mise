import { DIETS, type Diet } from "@merran/shared"
import {
  infiniteQueryOptions,
  queryOptions,
  useQueryClient,
} from "@tanstack/react-query"

import { api, unwrap, type Schemas } from "@/lib/api/client"

export type RecipeSummary = Schemas["RecipeSummary"]
export type Recipe = Schemas["Recipe"]
export type RecipeInput = Schemas["RecipeInput"]
export type RecipeVersion = Schemas["RecipeVersion"]
export type DeletedRecipe = Schemas["DeletedRecipe"]
export type Tag = Schemas["Tag"]
export type CookNote = Schemas["CookNote"]
export type RecipePairings = Schemas["RecipePairings"]

export const RECIPE_SORTS = [
  "newest",
  "name",
  "updated",
  "rating",
  "made",
] as const
export type RecipeSort = (typeof RECIPE_SORTS)[number]

/**
 * What the Recipes page is showing, as kept in its address. Tags are one
 * comma-separated value ("Baking,Dinner"), since a tag can't have a comma.
 */
export type RecipeSearch = {
  q?: string
  tags?: string
  /** Diet labels, comma-separated like tags: "vegan,gluten-free". */
  diets?: string
  /** Only recipes ready in this many minutes or fewer. */
  time?: RecipeTime
  /** Only recipes not made yet. */
  new?: true
  /** Only recipes with a deal at the household's store. */
  onSale?: true
  sort?: RecipeSort
}

/** The times to filter by, in minutes. */
export const RECIPE_TIMES = [15, 30, 45, 60] as const
export type RecipeTime = (typeof RECIPE_TIMES)[number]

/** The tags a search is for, as a list. */
export function searchTags(search: RecipeSearch): string[] {
  return (search.tags ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
}

/** The diet labels a search is for, as a list. */
export function searchDiets(search: RecipeSearch): Diet[] {
  const picked = (search.diets ?? "").split(",")
  return DIETS.filter((diet) => picked.includes(diet))
}

const PAGE = 48

export const recipesQuery = (search: RecipeSearch) =>
  infiniteQueryOptions({
    queryKey: ["recipes", "list", search],
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET("/api/recipes", {
          params: {
            query: {
              ...(search.q ? { q: search.q } : {}),
              ...(searchTags(search).length > 0
                ? { tag: searchTags(search) }
                : {}),
              ...(searchDiets(search).length > 0
                ? { diet: searchDiets(search) }
                : {}),
              ...(search.time ? { maxMinutes: search.time } : {}),
              ...(search.new ? { new: "true" } : {}),
              ...(search.onSale ? { onSale: "true" } : {}),
              sort: search.sort ?? "newest",
              limit: PAGE,
              offset: pageParam,
            },
          },
        })
      ),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, page) => n + page.recipes.length, 0)
      return loaded < last.total ? loaded : undefined
    },
  })

export const recipeQuery = (slug: string) =>
  queryOptions({
    queryKey: ["recipes", "detail", slug],
    queryFn: () =>
      unwrap(
        api.GET("/api/recipes/{recipe}", {
          params: { path: { recipe: slug } },
        })
      ),
  })

export const versionsQuery = (slug: string) =>
  queryOptions({
    queryKey: ["recipes", "versions", slug],
    queryFn: () =>
      unwrap(
        api.GET("/api/recipes/{recipe}/versions", {
          params: { path: { recipe: slug } },
        })
      ),
  })

export const deletedQuery = queryOptions({
  queryKey: ["recipes", "deleted"],
  queryFn: () => unwrap(api.GET("/api/recipes/deleted")),
})

export const tagsQuery = queryOptions({
  queryKey: ["tags"],
  queryFn: () => unwrap(api.GET("/api/recipes/tags")),
})

/** After any change to recipes: everything about them, the plan too, is loaded again. */
export function useRefreshRecipes() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["recipes"] }),
      queryClient.invalidateQueries({ queryKey: tagsQuery.queryKey }),
      // The plan shows recipes too, and making one marks its meal cooked.
      queryClient.invalidateQueries({ queryKey: ["plan"] }),
    ])
}

export const cookNotesQuery = (recipeId: string) =>
  queryOptions({
    queryKey: ["recipes", "cook-notes", recipeId],
    queryFn: () =>
      unwrap(
        api.GET("/api/recipes/{recipe}/cook-notes", {
          params: { path: { recipe: recipeId } },
        })
      ),
  })

export const pairingsQuery = (recipeId: string) =>
  queryOptions({
    queryKey: ["recipes", "pairings", recipeId],
    queryFn: () =>
      unwrap(
        api.GET("/api/recipes/{recipe}/pairings", {
          params: { path: { recipe: recipeId } },
        })
      ),
  })

import { queryOptions } from "@tanstack/react-query"

import { api, unwrap, type Schemas } from "@/lib/api/client"

export type ShoppingList = Schemas["ShoppingList"]
export type List = Schemas["List"]
export type ListItem = Schemas["ListItem"]
export type ListItemSnapshot = Schemas["ListItemSnapshot"]
export type Aisle = ShoppingList["aisles"][number]
export type EveryWeekItem = Schemas["EveryWeekItem"]
export type UsualBuy = Schemas["UsualBuys"]["items"][number]

/** The list, its aisles and its items by aisle. */
export const listQuery = queryOptions({
  queryKey: ["list"],
  queryFn: () => unwrap(api.GET("/api/list")),
})

/** What the household buys every so often and is about due for. */
export const usualQuery = queryOptions({
  queryKey: ["list", "usual"],
  queryFn: () => unwrap(api.GET("/api/list/usual")),
})

export const everyWeekQuery = queryOptions({
  queryKey: ["list", "every-week"],
  queryFn: () => unwrap(api.GET("/api/list/every-week")),
})

export const onHandQuery = queryOptions({
  queryKey: ["household", "on-hand"],
  queryFn: () => unwrap(api.GET("/api/households/current/on-hand")),
})

/** The planned meals from one day to another that aren't on the list yet. */
export const fromPlanQuery = (from: string, to: string) =>
  queryOptions({
    queryKey: ["list", "from-plan", from, to],
    queryFn: () =>
      unwrap(
        api.GET("/api/list/from-plan", { params: { query: { from, to } } })
      ),
  })

export type FoodAlias = Schemas["FoodAlias"]

/** The household's own names for foods, taught on the list. */
export const foodAliasesQuery = queryOptions({
  queryKey: ["list", "foods"],
  queryFn: () => unwrap(api.GET("/api/list/foods")),
})

/** The names a line on the list was joined from, for Not the same. */
export const joinedNamesQuery = (itemId: string) =>
  queryOptions({
    queryKey: ["list", "items", itemId, "names"],
    queryFn: () =>
      unwrap(
        api.GET("/api/list/items/{itemId}/names", {
          params: { path: { itemId } },
        })
      ),
  })

import { worthIt } from "@merran/shared"
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query"

import { useCapability } from "@/features/capabilities/queries"

import { api, unwrap, type Schemas } from "@/lib/api/client"

export type StoresStatus = Schemas["StoresStatus"]
export type StoreLocation = Schemas["StoreLocation"]
export type StoreProduct = Schemas["StoreProduct"]
export type Basket = Schemas["Basket"]
export type BasketLine = Schemas["BasketLine"]
export type Deals = Schemas["Deals"]
export type RecipeSale = Deals["recipes"][string][number]
export type ListPrices = Schemas["ListPrices"]
export type ItemPrice = ListPrices["items"][string]
export type YourStore = Schemas["YourStores"]["stores"][number]
export type SendPlan = Schemas["SendPlan"]

/** The household's stores with an API: its Kroger, and the linked account. */
export const storesQuery = queryOptions({
  queryKey: ["stores"],
  queryFn: () => unwrap(api.GET("/api/stores")),
})

/** Every list's cart at Kroger, to ask for again after a change. */
const KROGER_BASKETS = ["stores", "kroger", "basket"] as const

/** Things on the list by id, as the baskets take them. */
const itemsQuery = (items: readonly string[] | undefined) =>
  items && items.length > 0 ? { items: items.join(",") } : {}

/**
 * What things are at Kroger: a product for each, and how many. The ones
 * Send has going to Kroger; without them, everything left on every list.
 */
export const krogerBasketQuery = (items?: readonly string[]) =>
  queryOptions({
    queryKey: [...KROGER_BASKETS, items?.join(",") ?? null],
    queryFn: () =>
      unwrap(
        api.GET("/api/stores/kroger/basket", {
          params: { query: itemsQuery(items) },
        })
      ),
    // Kroger's search and an AI pick: not something to redo on every focus.
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  })

/**
 * What things are at Walmart: the products kept and what's still to find,
 * which Merran's browser extension looks for. The ones Send has going to
 * Walmart, as with Kroger. Only what Merran has: cheap to ask again as the
 * extension moves on.
 */
export const walmartBasketQuery = (items?: readonly string[]) =>
  queryOptions({
    queryKey: ["stores", "walmart", "basket", items?.join(",") ?? null],
    queryFn: () =>
      unwrap(
        api.GET("/api/stores/walmart/basket", {
          params: { query: itemsQuery(items) },
        })
      ),
  })

/**
 * The stores the household shops at, for Find: its Kroger store and
 * Walmart, which Merran can find products at, then the ones it picked.
 */
export const yourStoresQuery = queryOptions({
  queryKey: ["stores", "yours"],
  queryFn: async () => (await unwrap(api.GET("/api/stores/yours"))).stores,
  staleTime: 5 * 60_000,
})

/** Send's plan for a list: which stores each thing on it is picked at. */
export const sendPlanQuery = (list: string) =>
  queryOptions({
    queryKey: ["stores", "send-plan", list],
    queryFn: () =>
      unwrap(api.GET("/api/stores/send-plan", { params: { query: { list } } })),
  })

/** What's on sale at the household's store, and the recipes it's in. */
export const dealsQuery = queryOptions({
  queryKey: ["stores", "deals"],
  queryFn: () => unwrap(api.GET("/api/stores/deals")),
  staleTime: 10 * 60_000,
})

/**
 * The household's deals when it has a Kroger store: each recipe's real
 * deals (not those barely off), and whether there are any.
 */
export function useDeals() {
  const on = useCapability("stores.kroger")
  const { data } = useQuery({ ...dealsQuery, enabled: on })
  const recipes = new Map(
    Object.entries(data?.recipes ?? {}).flatMap(([id, sales]) => {
      const worth = sales.filter((sale) => worthIt(sale.verdict))
      return worth.length > 0 ? [[id, worth] as const] : []
    })
  )
  return { data, recipes, any: recipes.size > 0 }
}

/** What recipes cost at the household's store, and its weekly budget. */
export const costsQuery = queryOptions({
  queryKey: ["stores", "costs"],
  queryFn: () => unwrap(api.GET("/api/stores/costs")),
  staleTime: 10 * 60_000,
})

/** Recipes' costs when the household has a Kroger store, by recipe id. */
export function useCosts() {
  const on = useCapability("stores.kroger")
  const { data } = useQuery({ ...costsQuery, enabled: on })
  return {
    recipes: new Map(Object.entries(data?.recipes ?? {})),
    currency: data?.currency ?? "USD",
    weeklyBudget: data?.weeklyBudget ?? null,
  }
}

/**
 * What the things left on the list cost at the household's store. Under
 * the list's key, so it's asked again whenever the list changes.
 */
export const listPricesQuery = queryOptions({
  queryKey: ["list", "prices"],
  queryFn: () => unwrap(api.GET("/api/stores/list-prices")),
})

/** The list's prices, each at its store, when the household has one. */
export function useListPrices() {
  const kroger = useCapability("stores.kroger")
  const walmart = useCapability("stores.walmart")
  const on = kroger || walmart
  const { data } = useQuery({ ...listPricesQuery, enabled: on })
  return {
    items: new Map(Object.entries(data?.items ?? {})),
    currency: data?.currency ?? "USD",
  }
}

/** Keeps the household's stores after a change. */
export function useSetStores() {
  const queryClient = useQueryClient()
  return (status: StoresStatus) => {
    queryClient.setQueryData(storesQuery.queryKey, status)
    void queryClient.invalidateQueries({ queryKey: KROGER_BASKETS })
    void queryClient.invalidateQueries({ queryKey: dealsQuery.queryKey })
    void queryClient.invalidateQueries({ queryKey: costsQuery.queryKey })
    void queryClient.invalidateQueries({ queryKey: listPricesQuery.queryKey })
  }
}

/** A price in cents, in the store's currency. */
export function formatPrice(
  cents: number,
  currency: string,
  locale?: string
): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(
    cents / 100
  )
}

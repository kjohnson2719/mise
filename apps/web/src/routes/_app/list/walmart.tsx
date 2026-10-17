import { createFileRoute } from "@tanstack/react-router"

import { WalmartBasketPage } from "@/features/stores/walmart-basket-page"

type BasketSearch = { items?: string; list?: string }

/**
 * Walmart's part of Send: `?items=` the things going there, by id with
 * commas, and `?list=` the list it was for, to go back to.
 */
export const Route = createFileRoute("/_app/list/walmart")({
  validateSearch: (search: Record<string, unknown>): BasketSearch => ({
    ...(typeof search.items === "string" && search.items
      ? { items: search.items }
      : {}),
    ...(typeof search.list === "string" && search.list
      ? { list: search.list }
      : {}),
  }),
  component: WalmartRoute,
})

function WalmartRoute() {
  const { items, list } = Route.useSearch()
  return (
    <WalmartBasketPage
      items={items ? items.split(",") : undefined}
      list={list}
    />
  )
}

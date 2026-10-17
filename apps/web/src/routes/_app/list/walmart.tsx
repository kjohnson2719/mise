import { createFileRoute } from "@tanstack/react-router"

import { WalmartBasketPage } from "@/features/stores/walmart-basket-page"

type BasketSearch = { list?: string }

/** The list at Walmart; `?list=` is the one the person was looking at. */
export const Route = createFileRoute("/_app/list/walmart")({
  validateSearch: (search: Record<string, unknown>): BasketSearch =>
    typeof search.list === "string" && search.list ? { list: search.list } : {},
  component: WalmartRoute,
})

function WalmartRoute() {
  const { list } = Route.useSearch()
  return <WalmartBasketPage list={list} />
}

import { createFileRoute } from "@tanstack/react-router"

import { KrogerBasketPage } from "@/features/stores/kroger-basket-page"

type BasketSearch = { list?: string }

/** The list at Kroger; `?list=` is the one the person was looking at. */
export const Route = createFileRoute("/_app/list/kroger")({
  validateSearch: (search: Record<string, unknown>): BasketSearch =>
    typeof search.list === "string" && search.list ? { list: search.list } : {},
  component: KrogerRoute,
})

function KrogerRoute() {
  const { list } = Route.useSearch()
  return <KrogerBasketPage list={list} />
}

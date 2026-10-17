import { createFileRoute } from "@tanstack/react-router"

import { KrogerBasketPage } from "@/features/stores/kroger-basket-page"

type BasketSearch = { items?: string; list?: string }

/**
 * Kroger's part of Send: `?items=` the things going there, by id with
 * commas, and `?list=` the list it was for, to go back to.
 */
export const Route = createFileRoute("/_app/list/kroger")({
  validateSearch: (search: Record<string, unknown>): BasketSearch => ({
    ...(typeof search.items === "string" && search.items
      ? { items: search.items }
      : {}),
    ...(typeof search.list === "string" && search.list
      ? { list: search.list }
      : {}),
  }),
  component: KrogerRoute,
})

function KrogerRoute() {
  const { items, list } = Route.useSearch()
  return (
    <KrogerBasketPage
      items={items ? items.split(",") : undefined}
      list={list}
    />
  )
}

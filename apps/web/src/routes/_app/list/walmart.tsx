import { createFileRoute } from "@tanstack/react-router"

import { WalmartBasketPage } from "@/features/stores/walmart-basket-page"

export const Route = createFileRoute("/_app/list/walmart")({
  component: WalmartBasketPage,
})

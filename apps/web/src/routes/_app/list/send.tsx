import { createFileRoute, redirect } from "@tanstack/react-router"

import { SendPage } from "@/features/stores/send-page"

type SendSearch = { list: string }

/** Send, for one list: `?list=` the one the person was looking at. */
export const Route = createFileRoute("/_app/list/send")({
  validateSearch: (search: Record<string, unknown>): SendSearch => ({
    list: typeof search.list === "string" ? search.list : "",
  }),
  beforeLoad: ({ search }) => {
    if (!search.list) throw redirect({ to: "/list" })
  },
  component: SendRoute,
})

function SendRoute() {
  const { list } = Route.useSearch()
  return <SendPage list={list} />
}

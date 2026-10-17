import { createFileRoute } from "@tanstack/react-router"

import { ListPage } from "@/features/list/list-page"
import { listQuery } from "@/features/list/queries"

export const Route = createFileRoute("/_app/list/")({
  loader: ({ context: { queryClient } }) =>
    queryClient.ensureQueryData(listQuery),
  component: ListPage,
})

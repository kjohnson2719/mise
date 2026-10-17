import { createFileRoute } from "@tanstack/react-router"

import { PantryPage } from "@/features/pantry/pantry-page"
import { pantryQuery } from "@/features/pantry/queries"

export const Route = createFileRoute("/_app/pantry/")({
  loader: ({ context: { queryClient } }) =>
    queryClient.ensureQueryData(pantryQuery),
  component: PantryPage,
})

import { createFileRoute } from "@tanstack/react-router"

import { LinkImportPage } from "@/features/recipes/link-import-page"

/** How an import of several links is going. */
export const Route = createFileRoute("/_app/recipes/import/$importId")({
  component: LinkImportRoute,
})

function LinkImportRoute() {
  const { importId } = Route.useParams()
  return <LinkImportPage importId={importId} />
}

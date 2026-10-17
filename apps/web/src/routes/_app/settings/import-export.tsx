import { createFileRoute, redirect } from "@tanstack/react-router"

import { meQuery } from "@/features/auth/queries"
import { isAdminRole } from "@/features/household/queries"
import { AppImportCard } from "@/features/transfer/app-import-card"
import { ExportCard } from "@/features/transfer/export-card"
import { ImportCard } from "@/features/transfer/import-card"

/** Settings → Import and export: for the household's owners and admins. */
export const Route = createFileRoute("/_app/settings/import-export")({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery)
    const active = me?.households.find((h) => h.id === me.activeHouseholdId)
    if (!isAdminRole(active?.role)) throw redirect({ to: "/settings/you" })
  },
  component: ImportExportSettings,
})

function ImportExportSettings() {
  return (
    <>
      <ExportCard />
      <ImportCard />
      <AppImportCard />
    </>
  )
}

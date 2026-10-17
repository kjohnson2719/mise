import { isDay } from "@merran/shared"
import { createFileRoute } from "@tanstack/react-router"

import { householdQuery } from "@/features/household/queries"
import { PlanPage } from "@/features/plan/plan-page"

type PlanSearch = { week?: string }

/** The week plan; `?week=` is any day of the week to show. */
export const Route = createFileRoute("/_app/plan")({
  validateSearch: (search: Record<string, unknown>): PlanSearch =>
    typeof search.week === "string" && isDay(search.week)
      ? { week: search.week }
      : {},
  loader: ({ context }) => context.queryClient.ensureQueryData(householdQuery),
  component: PlanRoute,
})

function PlanRoute() {
  const { week } = Route.useSearch()
  return <PlanPage week={week} />
}

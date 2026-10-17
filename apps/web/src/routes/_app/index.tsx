import { createFileRoute } from "@tanstack/react-router"

import { TodayPage } from "@/features/today/today-page"

export const Route = createFileRoute("/_app/")({
  component: TodayPage,
})

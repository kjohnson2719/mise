import type { QueryClient } from "@tanstack/react-query"
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router"

import { NotFound, RouteError } from "@/components/layout/status-pages"

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    component: Outlet,
    notFoundComponent: NotFound,
    errorComponent: RouteError,
  }
)

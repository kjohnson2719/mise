import { createFileRoute, Outlet } from "@tanstack/react-router"

import { requireSignedIn } from "@/features/auth/require-signed-in"

/**
 * Pages that take the whole screen, signed in but without the sidebar or
 * tabs: the cook view.
 */
export const Route = createFileRoute("/_focus")({
  beforeLoad: ({ context, location }) =>
    requireSignedIn(context.queryClient, location.href),
  component: Outlet,
})

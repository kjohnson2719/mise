import { createFileRoute } from "@tanstack/react-router"

import { AppShell } from "@/components/layout/app-shell"
import { requireSignedIn } from "@/features/auth/require-signed-in"

/** Every page inside the app: signed in, with the sidebar or tabs around it. */
export const Route = createFileRoute("/_app")({
  beforeLoad: ({ context, location }) =>
    requireSignedIn(context.queryClient, location.href),
  component: AppShell,
})

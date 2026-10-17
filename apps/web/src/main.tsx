import "./i18n"
import "./index.css"

import { QueryClientProvider } from "@tanstack/react-query"
import { createRouter, RouterProvider } from "@tanstack/react-router"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { ThemeProvider } from "@/components/theme/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { TimerAlarm } from "@/features/cook/timers"
import { startErrorTracking } from "@/features/error-tracking/start"
import { HouseholdSwitchOverlay } from "@/features/household/switching"
import { listenForInstall } from "@/features/install/install"
import { registerServiceWorker } from "@/features/share/shared-files"
import { queryClient } from "@/lib/query-client"

import { routeTree } from "./routeTree.gen"

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  scrollRestoration: true,
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

void startErrorTracking(queryClient)
listenForInstall()
registerServiceWorker()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <RouterProvider router={router} />
          <HouseholdSwitchOverlay />
          <Toaster />
          <TimerAlarm />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>
)

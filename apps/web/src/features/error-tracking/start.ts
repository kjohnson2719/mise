import type { QueryClient } from "@tanstack/react-query"

import { capabilitiesQuery } from "@/features/capabilities/queries"

import { scrubEvent } from "./scrub"

type Sentry = typeof import("@sentry/browser")

/** What the server shares when error tracking is on. */
type ErrorTrackingOptions = {
  dsn: string
  environment: string
  sampleRate: number
  release: string
}

let sentry: Sentry | null = null

/**
 * Starts sending the browser's errors to the same place as the server's,
 * if the server admin has set that up. The SDK is only downloaded then.
 */
export async function startErrorTracking(queryClient: QueryClient) {
  try {
    const { client } = await queryClient.fetchQuery(capabilitiesQuery)
    const options = client.errorTracking as ErrorTrackingOptions | undefined
    if (!options) return

    const loaded = await import("@sentry/browser")
    loaded.init({
      ...options,
      // Errors only: no breadcrumbs of what people clicked or typed.
      defaultIntegrations: false,
      integrations: [
        loaded.globalHandlersIntegration(),
        loaded.browserApiErrorsIntegration(),
        loaded.linkedErrorsIntegration(),
        loaded.dedupeIntegration(),
      ],
      beforeSend: scrubEvent,
      beforeBreadcrumb: () => null,
    })
    sentry = loaded
  } catch {
    // The app works the same without it.
  }
}

/** Sends an error the app caught itself, like one shown on the error page. */
export function reportError(error: unknown) {
  sentry?.captureException(error)
}

import type { Logger } from "pino"
import { scrubEvent } from "./scrub.ts"

type Sentry = typeof import("@sentry/node")

export type ReporterOptions = {
  dsn: string | null
  environment: string
  sampleRate: number
  release: string
}

// The Sentry SDK is loaded only when there's somewhere to send errors, so a
// server without error tracking never loads it.
let sentry: Sentry | null = null
/** The options in use, or null when errors aren't being sent. */
let active: string | null = null

/** Starts, changes or stops sending errors, to match the settings. */
export async function configureReporter(
  options: ReporterOptions,
  logger: Logger
): Promise<void> {
  const wanted = options.dsn ? JSON.stringify(options) : null
  if (wanted === active) return
  if (active && sentry) await sentry.close(2_000)
  active = null
  if (!options.dsn) {
    logger.debug("Error tracking is off")
    return
  }
  sentry ??= await import("@sentry/node")
  sentry.init({
    dsn: options.dsn,
    environment: options.environment,
    sampleRate: options.sampleRate,
    release: options.release,
    // Only what's reported on purpose: no tracing, no breadcrumbs, no
    // patching of other libraries.
    defaultIntegrations: false,
    integrations: [
      sentry.linkedErrorsIntegration(),
      sentry.dedupeIntegration(),
    ],
    beforeSend: scrubEvent,
    beforeBreadcrumb: () => null,
  })
  active = wanted
  logger.info("Sending errors to error tracking")
}

/** Sends an error, if error tracking is on. */
export function reportError(
  err: unknown,
  context: { requestId?: string } = {}
): void {
  if (!active || !sentry) return
  sentry.captureException(err, {
    tags: context.requestId ? { requestId: context.requestId } : {},
  })
}

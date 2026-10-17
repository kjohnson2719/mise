import type { JobHandler } from "../../services/jobs/runner.ts"
import { buildReport } from "./report.ts"
import { TELEMETRY } from "./settings.ts"

/** The project's receiver (docs/operations.md, "Telemetry"). */
export const TELEMETRY_URL = "https://telemetry.merran.app/v1/reports"

/**
 * The daily summary, sent only if the server admin said yes: exactly what
 * Settings → This server → Telemetry shows.
 */
export const sendTelemetryJob: JobHandler = {
  kind: "telemetry.send",
  async run({ em, deps }) {
    if (!(await deps.settings.server(TELEMETRY.enabled))) return { sent: false }
    const report = await buildReport(em, deps, deps.modules)
    await deps.fetcher(TELEMETRY_URL, {
      json: report,
      accept: "application/json",
      maxBytes: 100_000,
    })
    return { sent: true }
  },
}

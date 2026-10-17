import type { Module } from "../module.ts"
import { TELEMETRY } from "./settings.ts"

/**
 * An anonymous summary for the Merran project, once a day, only if the
 * server admin says yes. Settings shows exactly what's in it.
 */
export const telemetry: Module = {
  id: "telemetry",
  settings: Object.values(TELEMETRY),

  async status({ settings }) {
    return (await settings.server(TELEMETRY.enabled))
      ? { on: true }
      : { on: false, needs: "consent" }
  },
}

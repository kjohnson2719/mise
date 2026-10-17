import type { Module } from "../module.ts"
import { UPDATES } from "./settings.ts"

/**
 * The update check: Merran's newest release, from GitHub every 6 hours,
 * for an Update badge for the server admin. On unless they turn it off.
 */
export const updates: Module = {
  id: "updates",
  settings: Object.values(UPDATES),

  async status({ settings }) {
    return (await settings.server(UPDATES.check))
      ? { on: true }
      : { on: false, needs: "switch" }
  },
}

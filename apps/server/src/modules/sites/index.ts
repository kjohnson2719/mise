import { enqueue } from "../../services/jobs/jobs.ts"
import { READ_SITES, READ_NOW_KEY } from "../../services/sites/read-job.ts"
import type { Module } from "../module.ts"
import { SITES } from "./settings.ts"

/**
 * Recipe sites: Merran reads the suggested sites' feeds, and any a
 * household follows, for following sites and starter collections. On by
 * default; it needs nothing but the internet.
 */
export const sites: Module = {
  id: "sites",
  settings: Object.values(SITES),
  capabilities: ["sites"],

  async status({ settings }) {
    return (await settings.server(SITES.enabled))
      ? { on: true }
      : { on: false, needs: "off" }
  },

  /**
   * Reads what's due a minute after start, and when turned on, rather than
   * waiting for the half hour.
   */
  async apply({ settings, database }) {
    if (!(await settings.server(SITES.enabled))) return
    await enqueue(database.em.fork(), {
      kind: READ_SITES,
      key: READ_NOW_KEY,
      runAt: new Date(Date.now() + 60_000),
      maxAttempts: 1,
    })
  },
}

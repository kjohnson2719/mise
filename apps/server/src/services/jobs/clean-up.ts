import { Job } from "../../database/entities/index.ts"
import { clearOldUploads } from "../transfer/read-export.ts"
import type { JobHandler } from "./runner.ts"

/** How long finished jobs stay on the Jobs page. */
export const KEEP_FINISHED_DAYS = 30

/**
 * The daily job that clears out finished jobs older than a month, and
 * uploads a failed import left behind a week ago.
 */
export const cleanUpJobsJob: JobHandler = {
  kind: "jobs.cleanUp",
  async run({ em, deps }) {
    const uploads = await clearOldUploads(deps.config.dataDir)
    const removed = await em.nativeDelete(Job, {
      status: { $in: ["done", "failed", "cancelled"] },
      finishedAt: {
        $lt: new Date(Date.now() - KEEP_FINISHED_DAYS * 24 * 60 * 60 * 1000),
      },
    })
    return { removed, uploads }
  },
}

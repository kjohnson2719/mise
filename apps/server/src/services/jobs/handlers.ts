import { sendTelemetryJob } from "../../modules/telemetry/send.ts"
import { checkUpdatesJob } from "../../modules/updates/check.ts"
import { aiPhotoRunJob } from "../ai-photos/runs.ts"
import { appImportJob } from "../importers/job.ts"
import { purgeDeletedJob } from "../recipes/deleted.ts"
import { discoverJob } from "../discover/discover.ts"
import { linkImportJob } from "../recipes/import/import-links.ts"
import { noteEditJob } from "../recipes/review/note-edits.ts"
import { tidyRunJob } from "../recipes/review/tidy-run.ts"
import { nutritionRunJob } from "../nutrition/runs.ts"
import { autoplanJob } from "../plan/autoplan.ts"
import { readSitesJob } from "../sites/read-job.ts"
import { checkPricesJob } from "../stores/prices.ts"
import { importJob } from "../transfer/import.ts"
import { rekeyFoodsJob } from "../list/rekey.ts"
import { cleanUpJobsJob } from "./clean-up.ts"
import type { JobHandler, JobSchedule } from "./runner.ts"

// Every kind of job Merran runs (docs/platform.md, "Jobs"). A new kind goes
// here, or the runner fails it as unknown.

export const JOB_HANDLERS: readonly JobHandler[] = [
  purgeDeletedJob,
  cleanUpJobsJob,
  sendTelemetryJob,
  importJob,
  appImportJob,
  linkImportJob,
  autoplanJob,
  tidyRunJob,
  nutritionRunJob,
  noteEditJob,
  discoverJob,
  readSitesJob,
  aiPhotoRunJob,
  checkPricesJob,
  rekeyFoodsJob,
  checkUpdatesJob,
]

/** Jobs that come round again, in the server's time. */
export const JOB_SCHEDULES: readonly JobSchedule[] = [
  { kind: purgeDeletedJob.kind, cron: "17 3 * * *" },
  { kind: cleanUpJobsJob.kind, cron: "27 3 * * *" },
  { kind: sendTelemetryJob.kind, cron: "41 4 * * *" },
  // Merran's newest release, for the server admin's Update badge.
  { kind: checkUpdatesJob.kind, cron: "53 */6 * * *" },
  // Each site is read every 6 hours; this finds the ones that are due.
  { kind: readSitesJob.kind, cron: "*/30 * * * *" },
  // Each household's prices are checked each morning; this finds them.
  { kind: checkPricesJob.kind, cron: "7,37 * * * *" },
]

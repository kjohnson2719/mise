import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { createdAt, id, updatedAt } from "./base.ts"
import { Household } from "./households.ts"
import { User } from "./users.ts"

export const JOB_STATUSES = [
  "queued",
  "running",
  "done",
  "failed",
  "cancelled",
] as const
export type JobStatus = (typeof JOB_STATUSES)[number]

/** How far a job has got: "Importing 12 of 52". */
export type JobProgress = { done: number; total: number }

/**
 * Work done in the background by the job runner (services/jobs): imports,
 * purges, the daily telemetry summary. Shared, since the runner sees every
 * household's jobs; a household's own are reached through the job services,
 * which check it.
 */
export const Job = defineEntity({
  name: "Job",
  tableName: "jobs",
  properties: {
    id: id(),
    /** What it does, like "household.import": which handler runs it. */
    kind: p.string().index(),
    /** The household it's for, if any. Deleting the household deletes its jobs. */
    forHousehold: () =>
      p.manyToOne(Household).ref().nullable().deleteRule("cascade").index(),
    /** Only one queued or running job has a key at a time: "schedule:telemetry.send". */
    key: p.string().nullable().index(),
    payload: p.json<Record<string, unknown>>(),
    status: p.enum(JOB_STATUSES).default("queued").index(),
    attempts: p.smallint().default(0),
    maxAttempts: p.smallint().default(3),
    /** Not before then: for schedules and retries. */
    runAt: p.datetime().index(),
    /** When it was taken to run; set while it's running. */
    startedAt: p.datetime().nullable(),
    finishedAt: p.datetime().nullable(),
    progress: p.json<JobProgress>().nullable(),
    result: p.json<Record<string, unknown>>().nullable(),
    /** Why it last failed, for the Jobs page. */
    error: p.text().nullable(),
    createdBy: () => p.manyToOne(User).ref().nullable().deleteRule("set null"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
})
export type Job = InferEntity<typeof Job>

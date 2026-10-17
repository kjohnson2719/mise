import type { EntityManager } from "@mikro-orm/sql"
import { AppError } from "../../core/errors.ts"
import { Job, type JobStatus } from "../../database/entities/index.ts"

// Adding, finding and changing jobs. The runner (runner.ts) does the work;
// these are what features and routes use.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Statuses a job is still to finish from. */
export const ACTIVE: readonly JobStatus[] = ["queued", "running"]

/** Something told when there's new work, so it starts straight away. */
let wake: () => void = () => {}

/** The runner listens here; with no runner (some tests), jobs just wait. */
export function onJobAdded(listener: () => void) {
  wake = listener
  return () => {
    if (wake === listener) wake = () => {}
  }
}

export type NewJob = {
  kind: string
  payload?: Record<string, unknown>
  householdId?: string | null
  /** Only one queued or running job with this key; adding another returns it. */
  key?: string
  runAt?: Date
  maxAttempts?: number
  createdBy?: string | null
  /** What it shows before it starts, for a job followed item by item. */
  result?: Record<string, unknown>
}

/**
 * Adds a job. Given a transaction's entity manager, the job is part of it,
 * and only runs if the change that needed it is saved.
 */
export async function enqueue(em: EntityManager, job: NewJob) {
  if (job.key) {
    const existing = await em.findOne(Job, {
      key: job.key,
      status: { $in: [...ACTIVE] },
    })
    if (existing) return existing
  }
  const created = em.create(Job, {
    kind: job.kind,
    payload: job.payload ?? {},
    forHousehold: job.householdId ?? null,
    key: job.key ?? null,
    runAt: job.runAt ?? new Date(),
    maxAttempts: job.maxAttempts ?? 3,
    createdBy: job.createdBy ?? null,
    result: job.result ?? null,
  })
  await em.flush()
  wake()
  return created
}

/** Jobs that come round again have this key (see runner.ts). */
const isScheduled = (job: Job) => job.key?.startsWith("schedule:") ?? false

/** A job as the API shows it. */
export function describeJob(job: Job) {
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    scheduled: isScheduled(job),
    householdId: job.forHousehold?.id ?? null,
    progress: job.progress ?? null,
    result: job.result ?? null,
    error: job.error ?? null,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    runAt: job.runAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
  }
}

/** A job, if it's this household's (or any, for the server admin with null). */
export async function findJob(
  em: EntityManager,
  jobId: string,
  householdId: string | null
) {
  const job = UUID.test(jobId)
    ? await em.findOne(Job, {
        id: jobId,
        ...(householdId === null ? {} : { forHousehold: householdId }),
      })
    : null
  if (!job) {
    throw new AppError("not_found", "job_not_found", "There's no such job.")
  }
  return job
}

/** The latest jobs, newest first: for Settings → This server → Jobs. */
export async function listJobs(
  em: EntityManager,
  { status, limit = 100 }: { status?: JobStatus; limit?: number } = {}
) {
  const jobs = await em.find(Job, status ? { status } : {}, {
    orderBy: { createdAt: "desc", id: "desc" },
    limit,
    populate: ["forHousehold"],
  })
  return jobs.map((job) => ({
    ...describeJob(job),
    householdName: job.forHousehold?.getEntity().name ?? null,
  }))
}

/**
 * Stops a job: one waiting is cancelled at once; one running is asked to
 * stop, through `stopRunning`, and the runner marks it cancelled.
 */
export async function cancelJob(
  em: EntityManager,
  job: Job,
  stopRunning: (jobId: string) => void
) {
  if (job.status === "queued" && isScheduled(job)) {
    throw new AppError(
      "conflict",
      "job_scheduled",
      "That job comes round on a schedule, so it can only be stopped while it's running."
    )
  }
  if (job.status === "queued") {
    job.status = "cancelled"
    job.finishedAt = new Date()
    await em.flush()
  } else if (job.status === "running") {
    stopRunning(job.id)
  } else {
    throw new AppError(
      "conflict",
      "job_finished",
      "That job has already finished."
    )
  }
  return job
}

/** Tries a failed or cancelled job again, from the start. */
export async function retryJob(em: EntityManager, job: Job) {
  if (job.status !== "failed" && job.status !== "cancelled") {
    throw new AppError(
      "conflict",
      "job_not_finished",
      "Only a failed or cancelled job can be tried again."
    )
  }
  if (job.key) {
    const other = await em.findOne(Job, {
      key: job.key,
      status: { $in: [...ACTIVE] },
      id: { $ne: job.id },
    })
    if (other) {
      throw new AppError(
        "conflict",
        "job_already_queued",
        "Another one of these is already waiting or running."
      )
    }
  }
  job.status = "queued"
  job.attempts = 0
  job.runAt = new Date()
  job.error = null
  job.progress = null
  job.result = null
  job.startedAt = null
  job.finishedAt = null
  await em.flush()
  wake()
  return job
}

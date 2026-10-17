import type { EntityManager } from "@mikro-orm/sql"
import { Cron } from "croner"
import type { Logger } from "pino"
import type { Config } from "../../core/config.ts"
import { Job } from "../../database/entities/index.ts"
import type { Database } from "../../database/orm.ts"
import { forHousehold } from "../../database/scope.ts"
import type { Module } from "../../modules/module.ts"
import type { EventBus } from "../events/events.ts"
import type { MediaMakers } from "../ai/media.ts"
import type { AiModels, Transcriber } from "../ai/providers.ts"
import type { Fetcher } from "../fetch/public-fetch.ts"
import type { Settings } from "../settings/settings.ts"
import type { FileStore } from "../storage/files.ts"
import type { VideoTools } from "../video/tools.ts"
import { enqueue, onJobAdded } from "./jobs.ts"

// Merran's job runner (docs/stack.md, "A job runner of our own"): one
// process, on SQLite or Postgres, working through the `jobs` table. A job is
// taken by a conditional update (queued → running), so it only runs once;
// there's a limit per kind and a fair share per household; failures are
// tried again with backoff; schedules come from croner; and jobs cut off by
// a restart start again.

/** What a job can use. */
export type JobDeps = {
  config: Config
  logger: Logger
  database: Database
  settings: Settings
  modules: readonly Module[]
  files: FileStore
  fetcher: Fetcher
  /** The AI models to call. */
  ai: AiModels
  /** Speech to text, for videos without captions. */
  transcribe: Transcriber
  /** Pictures and speech from AI. */
  media: MediaMakers
  /** yt-dlp and ffmpeg, for video import. */
  video: VideoTools
  /** What changed in each household, so open pages see what a job did. */
  events: EventBus
}

export type JobContext = {
  jobId: string
  payload: Record<string, unknown>
  householdId: string | null
  /** Its own entity manager: scoped to the job's household when it has one. */
  em: EntityManager
  /**
   * Says how far it's got, for "Importing 12 of 52", and what it's done so
   * far when someone follows it item by item (kept as its result).
   */
  progress(
    done: number,
    total: number,
    soFar?: Record<string, unknown>
  ): Promise<void>
  /** Aborted when someone stops the job, or Merran is shutting down. */
  signal: AbortSignal
  logger: Logger
  deps: JobDeps
}

export type JobHandler = {
  kind: string
  /** How many of this kind run at once. */
  concurrency?: number
  run(ctx: JobContext): Promise<Record<string, unknown> | void>
}

/** A job that comes round again: a cron expression, in the server's time. */
export type JobSchedule = { kind: string; cron: string }

/** Thrown into a job that's stopped, so it can tell. */
export class JobStopped extends Error {
  /** Someone stopped it, or Merran is shutting down (it runs again next start). */
  readonly why: "cancelled" | "shutdown" | null

  constructor(why: "cancelled" | "shutdown" | null = null) {
    super("Stopped")
    this.name = "JobStopped"
    this.why = why
  }
}

type Running = {
  controller: AbortController
  kind: string
  householdId: string | null
  /** Why it was stopped, if it was. */
  stopped?: "cancelled" | "shutdown"
  done: Promise<void>
}

const RETRY_BASE_MS = 30_000
const RETRY_MAX_MS = 30 * 60_000
/** How often to check for due work, when nothing says there's new work. */
const POLL_MS = 5_000
/** How long a job's progress waits before being saved again. */
const PROGRESS_EVERY_MS = 500

const scheduleKey = (kind: string) => `schedule:${kind}`

export class JobRunner {
  readonly #deps: JobDeps
  readonly #handlers: Map<string, JobHandler>
  readonly #schedules: readonly JobSchedule[]
  readonly #maxRunning: number
  readonly #running = new Map<string, Running>()
  #timer: NodeJS.Timeout | null = null
  #ticking: Promise<void> | null = null
  #again = false
  #stopping = false
  #stopListening: (() => void) | null = null

  constructor(options: {
    deps: JobDeps
    handlers: readonly JobHandler[]
    schedules?: readonly JobSchedule[]
    /** At most this many jobs at once, of all kinds. */
    maxRunning?: number
  }) {
    this.#deps = options.deps
    this.#handlers = new Map(options.handlers.map((h) => [h.kind, h]))
    this.#schedules = options.schedules ?? []
    this.#maxRunning = options.maxRunning ?? 4
  }

  #em() {
    return this.#deps.database.em.fork()
  }

  /** Picks up where things were left, sets up schedules, and starts working. */
  async start() {
    const em = this.#em()
    // Jobs cut off by a restart run again, without counting as a try.
    const interrupted = await em.find(Job, { status: "running" })
    for (const job of interrupted) {
      job.status = "queued"
      job.attempts = Math.max(0, job.attempts - 1)
      job.startedAt = null
    }
    await em.flush()
    for (const schedule of this.#schedules) {
      await this.#ensureScheduled(em, schedule)
    }
    this.#stopListening = onJobAdded(() => this.wake())
    this.#loop()
  }

  /** Stops taking work and stops what's running; it runs again next start. */
  async stop() {
    this.#stopping = true
    this.#stopListening?.()
    if (this.#timer) clearTimeout(this.#timer)
    for (const running of this.#running.values()) {
      running.stopped = "shutdown"
      running.controller.abort(new JobStopped("shutdown"))
    }
    await Promise.all([...this.#running.values()].map((r) => r.done))
    await this.#ticking
  }

  /** Looks for work now, rather than at the next check. */
  wake() {
    if (this.#stopping) return
    if (this.#ticking) {
      this.#again = true
      return
    }
    void this.#check().then(() => {
      if (this.#again) {
        this.#again = false
        this.wake()
      }
    })
  }

  /** One check for work at a time, so two can't both take the last place. */
  async #check() {
    while (this.#ticking) await this.#ticking
    this.#ticking = this.#tick()
      .catch((err: unknown) =>
        this.#deps.logger.error(
          { err },
          "The job runner couldn't check for work"
        )
      )
      .finally(() => {
        this.#ticking = null
      })
    await this.#ticking
  }

  /** Asks a running job to stop. */
  stopJob(jobId: string) {
    const running = this.#running.get(jobId)
    if (!running) return
    running.stopped = "cancelled"
    running.controller.abort(new JobStopped("cancelled"))
  }

  /** For tests: works until nothing's due or running. */
  async drain() {
    for (let round = 0; round < 1000; round++) {
      await this.#check()
      if (this.#running.size > 0) {
        await Promise.race([...this.#running.values()].map((r) => r.done))
        continue
      }
      const due = await this.#em().count(Job, {
        status: "queued",
        runAt: { $lte: new Date() },
      })
      if (due === 0) return
    }
    throw new Error("The jobs never finished")
  }

  #loop() {
    if (this.#stopping) return
    this.wake()
    this.#timer = setTimeout(() => this.#loop(), POLL_MS)
    this.#timer.unref()
  }

  async #tick() {
    if (this.#stopping) return
    const free = this.#maxRunning - this.#running.size
    if (free <= 0) return
    const em = this.#em()
    const due = await em.find(
      Job,
      { status: "queued", runAt: { $lte: new Date() } },
      { orderBy: { runAt: "asc", createdAt: "asc" }, limit: 50 }
    )
    const byKind = new Map<string, number>()
    const byHousehold = new Map<string, number>()
    for (const running of this.#running.values()) {
      byKind.set(running.kind, (byKind.get(running.kind) ?? 0) + 1)
      const household = running.householdId ?? ""
      byHousehold.set(household, (byHousehold.get(household) ?? 0) + 1)
    }

    let started = 0
    // A fair share: households with the least running go first.
    const queue = [...due]
    while (started < free && queue.length > 0) {
      queue.sort(
        (a, b) =>
          (byHousehold.get(a.forHousehold?.id ?? "") ?? 0) -
          (byHousehold.get(b.forHousehold?.id ?? "") ?? 0)
      )
      const job = queue.shift()!
      const handler = this.#handlers.get(job.kind)
      if (!handler) {
        await this.#finish(job.id, {
          status: "failed",
          error: `Merran doesn't know how to run "${job.kind}" jobs.`,
        })
        continue
      }
      if ((byKind.get(job.kind) ?? 0) >= (handler.concurrency ?? 1)) continue
      // Taken only if still queued, so it runs once.
      const taken = await em.nativeUpdate(
        Job,
        { id: job.id, status: "queued" },
        { status: "running", startedAt: new Date(), attempts: job.attempts + 1 }
      )
      if (taken !== 1) continue
      const household = job.forHousehold?.id ?? null
      byKind.set(job.kind, (byKind.get(job.kind) ?? 0) + 1)
      byHousehold.set(
        household ?? "",
        (byHousehold.get(household ?? "") ?? 0) + 1
      )
      this.#run(handler, job, job.attempts + 1)
      started++
    }
  }

  #run(handler: JobHandler, job: Job, attempt: number) {
    const controller = new AbortController()
    const householdId = job.forHousehold?.id ?? null
    const logger = this.#deps.logger.child({ job: job.id, kind: job.kind })
    const running: Running = {
      controller,
      kind: job.kind,
      householdId,
      done: Promise.resolve(),
    }
    this.#running.set(job.id, running)

    let lastProgress = 0
    const ctx: JobContext = {
      jobId: job.id,
      payload: job.payload,
      householdId,
      em: householdId
        ? forHousehold(this.#deps.database.em, householdId)
        : this.#em(),
      progress: async (done, total, soFar) => {
        const now = Date.now()
        if (done < total && now - lastProgress < PROGRESS_EVERY_MS) return
        lastProgress = now
        await this.#em().nativeUpdate(
          Job,
          { id: job.id },
          { progress: { done, total }, ...(soFar ? { result: soFar } : {}) }
        )
      },
      signal: controller.signal,
      logger,
      deps: this.#deps,
    }

    running.done = (async () => {
      try {
        const result = await handler.run(ctx)
        await this.#finish(job.id, {
          status: "done",
          result: result ?? null,
          error: null,
        })
      } catch (err) {
        if (running.stopped === "cancelled") {
          await this.#finish(job.id, { status: "cancelled" })
        } else if (running.stopped === "shutdown") {
          // Runs again at the next start, without counting as a try.
          await this.#em().nativeUpdate(
            Job,
            { id: job.id },
            { status: "queued", attempts: attempt - 1, startedAt: null }
          )
        } else {
          const message = err instanceof Error ? err.message : String(err)
          if (attempt < job.maxAttempts) {
            logger.warn({ err }, `Job failed; trying again (${attempt})`)
            const wait = Math.min(
              RETRY_MAX_MS,
              RETRY_BASE_MS * 2 ** (attempt - 1)
            )
            await this.#em().nativeUpdate(
              Job,
              { id: job.id },
              {
                status: "queued",
                runAt: new Date(Date.now() + wait),
                error: message,
                startedAt: null,
              }
            )
          } else {
            logger.error({ err }, "Job failed")
            await this.#finish(job.id, { status: "failed", error: message })
          }
        }
      } finally {
        this.#running.delete(job.id)
        const schedule = this.#schedules.find((s) => s.kind === job.kind)
        if (schedule && job.key === scheduleKey(job.kind)) {
          await this.#ensureScheduled(this.#em(), schedule).catch(
            (err: unknown) =>
              logger.error({ err }, "Couldn't schedule the next one")
          )
        }
        this.wake()
      }
    })()
  }

  async #finish(
    jobId: string,
    changes: Partial<Pick<Job, "status" | "result" | "error">>
  ) {
    await this.#em().nativeUpdate(
      Job,
      { id: jobId },
      { ...changes, finishedAt: new Date() }
    )
  }

  /** Makes sure a scheduled kind has its next run waiting. */
  async #ensureScheduled(em: EntityManager, schedule: JobSchedule) {
    const next = new Cron(schedule.cron).nextRun()
    if (!next) return
    await enqueue(em, {
      kind: schedule.kind,
      key: scheduleKey(schedule.kind),
      runAt: next,
      maxAttempts: 1,
    })
  }
}

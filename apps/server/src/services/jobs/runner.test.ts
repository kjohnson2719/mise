import { pino } from "pino"
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest"
import { Household, Job } from "../../database/entities/index.ts"
import type { Database } from "../../database/orm.ts"
import { createTestDatabase } from "../../test/database.ts"
import { cancelJob, enqueue, retryJob } from "./jobs.ts"
import {
  JobRunner,
  JobStopped,
  type JobDeps,
  type JobHandler,
} from "./runner.ts"

let database: Database
let close: () => Promise<void>
let home: string
let nextDoor: string

beforeAll(async () => {
  ;({ database, close } = await createTestDatabase())
  const em = database.em.fork()
  home = em.create(Household, { name: "Home", slug: "home" }).id
  nextDoor = em.create(Household, { name: "Next Door", slug: "next-door" }).id
  await em.flush()
})

afterAll(() => close())

beforeEach(async () => {
  await database.em.fork().nativeDelete(Job, {})
})

function runner(handlers: JobHandler[], options = {}) {
  const deps = {
    logger: pino({ level: "silent" }),
    database,
  } as unknown as JobDeps
  return new JobRunner({ deps, handlers, ...options })
}

const em = () => database.em.fork()
const load = (id: string) => em().findOneOrFail(Job, { id })

describe("the job runner", () => {
  test("runs a job, keeping its result and progress", async () => {
    const jobs = runner([
      {
        kind: "count",
        run: async ({ payload, progress }) => {
          await progress(2, 2)
          return { counted: payload.to }
        },
      },
    ])
    const job = await enqueue(em(), { kind: "count", payload: { to: 2 } })
    await jobs.drain()

    expect(await load(job.id)).toMatchObject({
      status: "done",
      attempts: 1,
      result: { counted: 2 },
      progress: { done: 2, total: 2 },
    })
  })

  test("tries a failed job again later, then gives up", async () => {
    let tries = 0
    const jobs = runner([
      {
        kind: "flaky",
        run: async () => {
          tries++
          throw new Error(`Broke on try ${tries}`)
        },
      },
    ])
    const job = await enqueue(em(), { kind: "flaky", maxAttempts: 2 })
    await jobs.drain()

    const waiting = await load(job.id)
    expect(waiting).toMatchObject({ status: "queued", error: "Broke on try 1" })
    expect(waiting.runAt.getTime()).toBeGreaterThan(Date.now())

    // Its wait is over.
    await em().nativeUpdate(Job, { id: job.id }, { runAt: new Date() })
    await jobs.drain()
    expect(await load(job.id)).toMatchObject({
      status: "failed",
      attempts: 2,
      error: "Broke on try 2",
    })

    // And it can be tried again from the start.
    const tx = em()
    await retryJob(tx, await tx.findOneOrFail(Job, { id: job.id }))
    expect(await load(job.id)).toMatchObject({ status: "queued", attempts: 0 })
  })

  test("runs one of a kind at a time, unless it says more", async () => {
    let now = 0
    let most = 0
    const slow: JobHandler = {
      kind: "slow",
      run: async () => {
        most = Math.max(most, ++now)
        await new Promise((resolve) => setTimeout(resolve, 20))
        now--
      },
    }
    for (let i = 0; i < 3; i++) await enqueue(em(), { kind: "slow" })
    await runner([slow]).drain()
    expect(most).toBe(1)

    // Each waits for the other two to start, rather than for a time that a
    // busy database can outlast. Not for long, if they never do.
    most = 0
    let started!: () => void
    const allStarted = new Promise<void>((resolve) => (started = resolve))
    const together: JobHandler = {
      kind: "slow",
      concurrency: 3,
      run: async () => {
        most = Math.max(most, ++now)
        if (now === 3) started()
        await Promise.race([
          allStarted,
          new Promise((resolve) => setTimeout(resolve, 1000)),
        ])
        now--
      },
    }
    for (let i = 0; i < 3; i++) await enqueue(em(), { kind: "slow" })
    await runner([together]).drain()
    expect(most).toBe(3)
  })

  test("gives each household a fair share", async () => {
    const started: string[] = []
    const jobs = runner(
      [
        {
          kind: "work",
          concurrency: 2,
          run: async ({ payload }) => {
            started.push(String(payload.name))
            await new Promise((resolve) => setTimeout(resolve, 10))
          },
        },
      ],
      { maxRunning: 2 }
    )
    for (const name of ["home 1", "home 2", "home 3"]) {
      await enqueue(em(), {
        kind: "work",
        householdId: home,
        payload: { name },
      })
    }
    await enqueue(em(), {
      kind: "work",
      householdId: nextDoor,
      payload: { name: "next door" },
    })
    await jobs.drain()

    // Next door doesn't wait for all of home's.
    expect(started.slice(0, 2).sort()).toEqual(["home 1", "next door"])
  })

  test("adds one job per key while it's waiting or running", async () => {
    const first = await enqueue(em(), { kind: "x", key: "only-one" })
    const second = await enqueue(em(), { kind: "x", key: "only-one" })
    expect(second.id).toBe(first.id)
  })

  test("can stop a job waiting or running", async () => {
    const jobs = runner([
      {
        kind: "long",
        run: ({ signal }) =>
          new Promise((_, reject) =>
            signal.addEventListener("abort", () => reject(signal.reason))
          ),
      },
    ])
    const waiting = await enqueue(em(), {
      kind: "long",
      runAt: new Date(Date.now() + 60_000),
    })
    const tx = em()
    await cancelJob(tx, await tx.findOneOrFail(Job, { id: waiting.id }), (id) =>
      jobs.stopJob(id)
    )
    expect((await load(waiting.id)).status).toBe("cancelled")

    const running = await enqueue(em(), { kind: "long" })
    const draining = jobs.drain()
    await expect
      .poll(async () => (await load(running.id)).status)
      .toBe("running")
    await cancelJob(em(), await load(running.id), (id) => jobs.stopJob(id))
    await draining
    expect((await load(running.id)).status).toBe("cancelled")
  })

  test("runs jobs cut off by a restart again, without counting a try", async () => {
    const job = await enqueue(em(), { kind: "resume" })
    await em().nativeUpdate(
      Job,
      { id: job.id },
      { status: "running", attempts: 1 }
    )
    const jobs = runner([{ kind: "resume", run: async () => ({ ok: true }) }])
    await jobs.start()
    await jobs.drain()
    await jobs.stop()

    expect(await load(job.id)).toMatchObject({ status: "done", attempts: 1 })
  })

  test("keeps the next run of a schedule waiting", async () => {
    let runs = 0
    const jobs = runner([{ kind: "nightly", run: async () => void runs++ }], {
      schedules: [{ kind: "nightly", cron: "0 3 * * *" }],
    })
    await jobs.start()
    const [next] = await em().find(Job, { kind: "nightly" })
    expect(next).toMatchObject({ status: "queued", key: "schedule:nightly" })
    expect(next!.runAt.getTime()).toBeGreaterThan(Date.now())

    // Its time comes: it runs, and the one after is waiting.
    await em().nativeUpdate(Job, { id: next!.id }, { runAt: new Date() })
    await jobs.drain()
    await jobs.stop()
    expect(runs).toBe(1)
    const after = await em().find(Job, { kind: "nightly", status: "queued" })
    expect(after).toHaveLength(1)
    expect(after[0]!.id).not.toBe(next!.id)
  })

  test("fails jobs it doesn't know how to run", async () => {
    const job = await enqueue(em(), { kind: "mystery" })
    await runner([]).drain()
    expect(await load(job.id)).toMatchObject({
      status: "failed",
      error: 'Merran doesn\'t know how to run "mystery" jobs.',
    })
  })

  test("leaves stopped jobs to run next time when shutting down", async () => {
    const jobs = runner([
      {
        kind: "long",
        run: ({ signal }) =>
          new Promise((_, reject) =>
            signal.addEventListener("abort", () => reject(new JobStopped()))
          ),
      },
    ])
    const job = await enqueue(em(), { kind: "long" })
    await jobs.start()
    await expect.poll(async () => (await load(job.id)).status).toBe("running")
    await jobs.stop()

    expect(await load(job.id)).toMatchObject({ status: "queued", attempts: 0 })
  })
})

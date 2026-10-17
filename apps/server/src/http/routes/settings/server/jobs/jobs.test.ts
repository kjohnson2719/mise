import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../../../app.ts"
import type { Database } from "../../../../../database/orm.ts"
import { enqueue } from "../../../../../services/jobs/jobs.ts"
import type { JobRunner } from "../../../../../services/jobs/runner.ts"
import {
  account,
  createTestApp,
  inviteToken,
  join,
  setUpServer,
  TestClient,
} from "../../../../../test/app.ts"

let app: App
let close: () => Promise<void>
let database: Database
let jobs: JobRunner
let kyle: TestClient
let jamie: TestClient
let householdId: string

beforeAll(async () => {
  const test = await createTestApp({
    jobHandlers: [
      {
        kind: "test.broken",
        run: async () => {
          throw new Error("It broke")
        },
      },
    ],
  })
  ;({ app, close, database, jobs } = test)
  kyle = await setUpServer(app, test.setupCode)
  jamie = await join(app, await inviteToken(kyle), account("jamie", "Jamie"))
  householdId = (await (await kyle.get("/api/households/current")).json()).id
})

afterAll(() => close())

const list = async (query = "") =>
  (await (await kyle.get(`/api/settings/server/jobs${query}`)).json()).jobs

describe("the server's jobs", () => {
  test("are listed for the server admin, with their household", async () => {
    await enqueue(database.em.fork(), {
      kind: "test.broken",
      householdId,
      maxAttempts: 1,
    })
    await jobs.drain()

    const [failed] = await list("?status=failed")
    expect(failed).toMatchObject({
      kind: "test.broken",
      status: "failed",
      error: "It broke",
      householdName: "Home",
    })
    expect((await jamie.get("/api/settings/server/jobs")).status).toBe(403)
  })

  test("can be tried again", async () => {
    const [failed] = await list("?status=failed")
    const res = await kyle.post(`/api/settings/server/jobs/${failed.id}/retry`)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: "queued", attempts: 0 })
    // Only finished ones.
    expect(
      (await kyle.post(`/api/settings/server/jobs/${failed.id}/retry`)).status
    ).toBe(409)
  })

  test("can be stopped while waiting", async () => {
    const [waiting] = await list("?status=queued")
    const res = await kyle.post(
      `/api/settings/server/jobs/${waiting.id}/cancel`
    )
    expect(await res.json()).toMatchObject({ status: "cancelled" })
    expect(
      (await kyle.post(`/api/settings/server/jobs/${waiting.id}/cancel`)).status
    ).toBe(409)
    expect(
      (await kyle.post("/api/settings/server/jobs/not-a-job/cancel")).status
    ).toBe(404)
  })
})

import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../../../app.ts"
import type { Database } from "../../../../../database/orm.ts"
import { enqueue } from "../../../../../services/jobs/jobs.ts"
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
let kyle: TestClient
let jamie: TestClient
let homeJob: string
let cabinJob: string

beforeAll(async () => {
  const test = await createTestApp()
  ;({ app, close, database } = test)
  kyle = await setUpServer(app, test.setupCode)
  jamie = await join(app, await inviteToken(kyle), account("jamie", "Jamie"))
  const home = (await (await kyle.get("/api/households/current")).json()).id
  const cabin = (
    await (await kyle.post("/api/households", { name: "Cabin" })).json()
  ).id
  const later = new Date(Date.now() + 60_000)
  homeJob = (
    await enqueue(database.em.fork(), {
      kind: "test.waiting",
      householdId: home,
      runAt: later,
    })
  ).id
  cabinJob = (
    await enqueue(database.em.fork(), {
      kind: "test.waiting",
      householdId: cabin,
      runAt: later,
    })
  ).id
  // Back to Home: making a household switches the server admin to it.
  await kyle.post("/api/auth/organization/set-active", {
    organizationId: home,
  })
})

afterAll(() => close())

describe("a household's jobs", () => {
  test("can be followed by its admins, and only its own", async () => {
    const res = await kyle.get(`/api/households/current/jobs/${homeJob}`)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: homeJob, status: "queued" })

    expect(
      (await kyle.get(`/api/households/current/jobs/${cabinJob}`)).status
    ).toBe(404)
    expect(
      (await jamie.get(`/api/households/current/jobs/${homeJob}`)).status
    ).toBe(403)
  })

  test("can be stopped", async () => {
    const res = await kyle.post(
      `/api/households/current/jobs/${homeJob}/cancel`
    )
    expect(await res.json()).toMatchObject({ status: "cancelled" })
  })
})

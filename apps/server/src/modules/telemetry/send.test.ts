import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../app.ts"
import { Job } from "../../database/entities/index.ts"
import type { Database } from "../../database/orm.ts"
import type { FetchOptions } from "../../services/fetch/public-fetch.ts"
import { enqueue } from "../../services/jobs/jobs.ts"
import type { JobRunner } from "../../services/jobs/runner.ts"
import { createTestApp, setUpServer, TestClient } from "../../test/app.ts"
import { TELEMETRY_URL } from "./send.ts"

let app: App
let close: () => Promise<void>
let database: Database
let jobs: JobRunner
let kyle: TestClient
const sent: { url: string; options: FetchOptions | undefined }[] = []

beforeAll(async () => {
  const test = await createTestApp({
    fetcher: async (url, options) => {
      sent.push({ url, options })
      return {
        url,
        status: 200,
        contentType: "application/json",
        body: Buffer.from("{}"),
      }
    },
  })
  ;({ app, close, database, jobs } = test)
  kyle = await setUpServer(app, test.setupCode)
})

afterAll(() => close())

async function sendSummary() {
  const job = await enqueue(database.em.fork(), { kind: "telemetry.send" })
  await jobs.drain()
  return database.em.fork().findOneOrFail(Job, { id: job.id })
}

describe("the daily telemetry summary", () => {
  test("isn't sent unless the server admin says yes", async () => {
    expect((await sendSummary()).result).toEqual({ sent: false })
    expect(sent).toEqual([])
  })

  test("is sent, exactly as Settings shows it, once they do", async () => {
    await kyle.patch("/api/settings/server", { "telemetry.enabled": true })
    const shown = await (await kyle.get("/api/telemetry/report")).json()

    expect((await sendSummary()).result).toEqual({ sent: true })
    expect(sent).toHaveLength(1)
    expect(sent[0]!.url).toBe(TELEMETRY_URL)
    expect(sent[0]!.options?.json).toEqual(shown)
  })
})

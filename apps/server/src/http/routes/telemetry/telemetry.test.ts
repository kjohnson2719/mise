import { afterAll, beforeAll, expect, test } from "vitest"
import type { App } from "../../../app.ts"
import { testDatabaseKind } from "../../../test/database.ts"
import {
  account,
  createTestApp,
  inviteToken,
  join,
  setUpServer,
  TestClient,
} from "../../../test/app.ts"

let app: App
let close: () => Promise<void>
let kyle: TestClient
let jamie: TestClient

beforeAll(async () => {
  const test = await createTestApp()
  ;({ app, close } = test)
  kyle = await setUpServer(app, test.setupCode)
  jamie = await join(app, await inviteToken(kyle), account("jamie", "Jamie"))
})

afterAll(() => close())

test("the next summary can be seen before saying yes to it", async () => {
  const res = await kyle.get("/api/telemetry/report")
  const report = await res.json()

  expect(res.status).toBe(200)
  expect(report).toEqual({
    installId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    version: expect.any(String),
    install: "source",
    arch: process.arch,
    database:
      testDatabaseKind === "sqlite"
        ? "sqlite"
        : expect.stringMatching(/^postgres \d+$/),
    // Tests have no yt-dlp or ffmpeg, so video import's off. Recipe sites
    // need nothing.
    modules: {
      ai: false,
      video: false,
      nutrition: false,
      sites: true,
      photos: false,
      voice: false,
      stores: false,
      errorTracking: false,
      telemetry: false,
      updates: true,
    },
    households: "1",
    people: "2-5",
    recipes: "0",
  })
  // Nothing about anyone.
  expect(JSON.stringify(report)).not.toMatch(/kyle|jamie|Home/i)
})

test("the install id stays the same until a new one is made", async () => {
  const first = (await (await kyle.get("/api/telemetry/report")).json())
    .installId
  expect(
    (await (await kyle.get("/api/telemetry/report")).json()).installId
  ).toBe(first)

  const res = await kyle.post("/api/telemetry/install-id")
  expect(res.status).toBe(200)
  const next = (await res.json()).installId
  expect(next).not.toBe(first)
  expect(
    (await (await kyle.get("/api/telemetry/report")).json()).installId
  ).toBe(next)
})

test("only the server admin sees it", async () => {
  expect((await jamie.get("/api/telemetry/report")).status).toBe(403)
  expect((await jamie.post("/api/telemetry/install-id")).status).toBe(403)
  expect((await new TestClient(app).get("/api/telemetry/report")).status).toBe(
    401
  )
})

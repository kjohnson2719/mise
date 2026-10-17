import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { z } from "zod"
import type { App } from "../../../app.ts"
import {
  numberSetting,
  secretSetting,
  textSetting,
} from "../../../core/settings.ts"
import { Secret } from "../../../database/entities/index.ts"
import type { Database } from "../../../database/orm.ts"
import type { Module } from "../../../modules/module.ts"
import type {
  SettingState,
  Settings,
} from "../../../services/settings/settings.ts"
import {
  account,
  createTestApp,
  inviteToken,
  join,
  setUpServer,
  TestClient,
} from "../../../test/app.ts"

// A module of the tests' own, with one of each sort of setting.
const TEST = {
  greeting: textSetting({
    key: "test.greeting",
    env: "MERRAN_TEST_GREETING",
    description: "Set in the environment, in these tests.",
    default: "hello",
  }),
  color: textSetting({
    key: "test.color",
    description: "",
    schema: z.enum(["red", "blue"], { error: "Pick red or blue." }),
    default: "red",
  }),
  apiKey: secretSetting({ key: "test.apiKey", description: "" }),
  householdKey: secretSetting({
    key: "test.householdKey",
    level: "household",
    description: "",
  }),
  limit: numberSetting({
    key: "test.limit",
    level: "household",
    description: "",
    schema: z.number().int().min(0, "Use 0 or more."),
    default: 5,
  }),
}

let applied = 0

const testModule: Module = {
  id: "test",
  settings: Object.values(TEST),
  async status({ settings }) {
    return (await settings.server(TEST.apiKey))
      ? { on: true }
      : { on: false, needs: "key" }
  },
  capabilities: ["test.things"],
  async client({ settings }) {
    return { color: await settings.server(TEST.color) }
  },
  async apply() {
    applied++
  },
}

const KEY = "sk-test-0123456789abcdef"

let app: App
let close: () => Promise<void>
let database: Database
let settings: Settings
let kyle: TestClient
let jamie: TestClient

beforeAll(async () => {
  const test = await createTestApp({
    modules: [testModule],
    env: { MERRAN_TEST_GREETING: "hi from the environment" },
  })
  ;({ app, close, database, settings } = test)
  kyle = await setUpServer(app, test.setupCode)
  jamie = await join(app, await inviteToken(kyle), account("jamie", "Jamie"))
})

afterAll(() => close())

async function serverSettings(client = kyle): Promise<SettingState[]> {
  const res = await client.get("/api/settings/server")
  expect(res.status).toBe(200)
  return (await res.json()).settings
}

const find = (states: SettingState[], key: string) =>
  states.find((state) => state.key === key)

describe("server settings", () => {
  test("are only for the server admin", async () => {
    expect((await jamie.get("/api/settings/server")).status).toBe(403)
    expect((await new TestClient(app).get("/api/settings/server")).status).toBe(
      401
    )
    expect(
      (await jamie.patch("/api/settings/server", { "test.color": "blue" }))
        .status
    ).toBe(403)
  })

  test("show each setting with where its value comes from", async () => {
    const states = await serverSettings()

    expect(find(states, "test.color")).toMatchObject({
      kind: "text",
      value: "red",
      default: "red",
      source: "default",
      lockedBy: null,
    })
    expect(find(states, "telemetry.enabled")).toMatchObject({
      kind: "switch",
      value: false,
    })
    // Kept by Merran itself, or only from the environment: not shown.
    expect(find(states, "telemetry.installId")).toBeUndefined()
    expect(find(states, "server.port")).toBeUndefined()
  })

  test("from the environment are locked", async () => {
    expect(find(await serverSettings(), "test.greeting")).toMatchObject({
      value: "hi from the environment",
      source: "environment",
      lockedBy: "MERRAN_TEST_GREETING",
    })

    const res = await kyle.patch("/api/settings/server", {
      "test.greeting": "hello there",
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error.fields).toEqual({
      "test.greeting": "Set on the server, by MERRAN_TEST_GREETING.",
    })
  })

  test("are saved, and can go back to their default", async () => {
    const saved = await kyle.patch("/api/settings/server", {
      "test.color": "blue",
    })
    expect(saved.status).toBe(200)
    expect(find((await saved.json()).settings, "test.color")).toMatchObject({
      value: "blue",
      source: "saved",
    })
    expect(await settings.server(TEST.color)).toBe("blue")

    await kyle.patch("/api/settings/server", { "test.color": null })
    expect(await settings.server(TEST.color)).toBe("red")
  })

  test("aren't saved at all if anything is wrong", async () => {
    const res = await kyle.patch("/api/settings/server", {
      "test.color": "blue",
      "errorTracking.sampleRate": 3,
      "telemetry.installId": "mine",
      "test.limit": 1,
      "no.such": true,
    })

    expect(res.status).toBe(400)
    expect((await res.json()).error.fields).toEqual({
      "errorTracking.sampleRate": "Use a number from 0 to 1.",
      "telemetry.installId": "There's no such setting here.",
      "test.limit": "There's no such setting here.",
      "no.such": "There's no such setting here.",
    })
    expect(await settings.server(TEST.color)).toBe("red")
  })

  test("re-apply their module when they change", async () => {
    const before = applied
    await kyle.patch("/api/settings/server", { "test.color": "blue" })
    expect(applied).toBe(before + 1)

    await kyle.patch("/api/settings/server", { "telemetry.enabled": true })
    expect(applied).toBe(before + 1)

    await kyle.patch("/api/settings/server", {
      "test.color": null,
      "telemetry.enabled": null,
    })
  })
})

describe("secret settings", () => {
  test("are never sent back, only whether they're set", async () => {
    const res = await kyle.patch("/api/settings/server", { "test.apiKey": KEY })
    const text = await res.text()

    expect(res.status).toBe(200)
    expect(text).not.toContain(KEY)
    expect(find(JSON.parse(text).settings, "test.apiKey")).toMatchObject({
      kind: "secret",
      value: null,
      source: "saved",
      secret: { set: true, hint: "cdef", unreadable: false },
    })
  })

  test("are sealed in the database, and readable by the server", async () => {
    const stored = await database.em.fork().find(Secret, {})

    expect(stored).toHaveLength(1)
    expect(JSON.stringify(stored)).not.toContain(KEY)
    expect(await settings.server(TEST.apiKey)).toBe(KEY)
  })

  test("are replaced in place, and deleted with their setting", async () => {
    await kyle.patch("/api/settings/server", {
      "test.apiKey": "sk-test-a-newer-key-0000",
    })
    expect(await database.em.fork().count(Secret, {})).toBe(1)
    expect(await settings.server(TEST.apiKey)).toBe("sk-test-a-newer-key-0000")

    await kyle.patch("/api/settings/server", { "test.apiKey": null })
    expect(await database.em.fork().count(Secret, {})).toBe(0)
    expect(await settings.server(TEST.apiKey)).toBeNull()
  })
})

describe("capabilities", () => {
  test("say what's on, to anyone", async () => {
    const res = await new TestClient(app).get("/api/capabilities")
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.modules).toEqual(
      expect.arrayContaining([
        { id: "errorTracking", on: false, needs: "dsn" },
        { id: "telemetry", on: false, needs: "consent" },
        { id: "test", on: false, needs: "key" },
      ])
    )
    // Recipe sites need nothing, so they're on from the start.
    expect(body.capabilities).toEqual(["sites"])
    expect(body.client).toEqual({})
  })

  test("change as settings do", async () => {
    await kyle.patch("/api/settings/server", { "test.apiKey": KEY })
    const body = await (
      await new TestClient(app).get("/api/capabilities")
    ).json()

    expect(body.modules).toContainEqual({ id: "test", on: true })
    expect(body.capabilities).toEqual(["sites", "test.things"])
    expect(body.client).toEqual({ test: { color: "red" } })

    await kyle.patch("/api/settings/server", { "test.apiKey": null })
  })
})

describe("household settings", () => {
  test("anyone in the household can see them, only admins change them", async () => {
    const res = await jamie.get("/api/settings/household")
    expect(res.status).toBe(200)
    expect(find((await res.json()).settings, "test.limit")).toMatchObject({
      value: 5,
      source: "default",
    })

    expect(
      (await jamie.patch("/api/settings/household", { "test.limit": 2 })).status
    ).toBe(403)
    expect(
      (await kyle.patch("/api/settings/household", { "test.limit": 2 })).status
    ).toBe(200)
    expect(
      find(
        (await (await jamie.get("/api/settings/household")).json()).settings,
        "test.limit"
      )
    ).toMatchObject({ value: 2, source: "saved" })
  })

  test("belong to their household alone", async () => {
    await kyle.patch("/api/settings/household", {
      "test.householdKey": "sk-test-home-household-key",
    })
    const home = (await (await kyle.get("/api/households/current")).json()).id

    // A second household, which the server admin switches to on starting it.
    const started = await kyle.post("/api/households", { name: "Cabin" })
    expect(started.status).toBe(201)
    const cabin = (await started.json()).id

    const there = (await (await kyle.get("/api/settings/household")).json())
      .settings
    expect(find(there, "test.limit")).toMatchObject({ value: 5 })
    expect(find(there, "test.householdKey")?.secret).toMatchObject({
      set: false,
    })

    const em = database.em.fork()
    expect(await settings.household(em, home, TEST.householdKey)).toBe(
      "sk-test-home-household-key"
    )
    expect(await settings.household(em, cabin, TEST.householdKey)).toBeNull()
    expect(await settings.household(em, cabin, TEST.limit)).toBe(5)
  })

  test("aren't server settings, and the other way round", async () => {
    const res = await kyle.patch("/api/settings/household", {
      "test.color": "blue",
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error.fields).toEqual({
      "test.color": "There's no such setting here.",
    })
  })
})

import { DEFAULT_AI_POLICY } from "@merran/shared"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../../../app.ts"
import { Secret } from "../../../../../database/entities/index.ts"
import type { Database } from "../../../../../database/orm.ts"
import {
  ADDRESSES,
  fakeAiFetcher,
  GOOD_KEYS,
  type FetchCall,
} from "../../../../../test/ai.ts"
import {
  account,
  createTestApp,
  inviteToken,
  join,
  setUpServer,
  TestClient,
} from "../../../../../test/app.ts"

// The server's AI, for the server admin: its keys and addresses, who may
// use them, and what's been spent on them.

let app: App
let database: Database
let close: () => Promise<void>
let kyle: TestClient
let jamie: TestClient
let homeId: string
const calls: FetchCall[] = []

async function serverAi() {
  const res = await kyle.get("/api/settings/server/ai")
  expect(res.status, await res.clone().text()).toBe(200)
  return res.json()
}

const addKey = (body: unknown) =>
  kyle.post("/api/settings/server/ai/keys", body)

beforeAll(async () => {
  const test = await createTestApp({ fetcher: fakeAiFetcher(calls) })
  ;({ app, database, close } = test)
  kyle = await setUpServer(app, test.setupCode)
  homeId = (await (await kyle.get("/api/households/current")).json()).id
  jamie = await join(app, await inviteToken(kyle), account("jamie", "Jamie"))
})

afterAll(() => close())

describe("the server's AI", () => {
  test("is the server admin's to see", async () => {
    expect((await jamie.get("/api/settings/server/ai")).status).toBe(403)
    expect(
      (await jamie.put("/api/settings/server/ai/policy", DEFAULT_AI_POLICY))
        .status
    ).toBe(403)
  })

  test("starts with no keys, covering the server admins' households", async () => {
    const ai = await serverAi()
    expect(ai.keys).toEqual([])
    expect(ai.models).toEqual([])
    expect(ai.policy).toEqual(DEFAULT_AI_POLICY)
    expect(ai.households).toMatchObject([
      { id: homeId, name: "Home", covered: true, serverAdmin: true, spent: 0 },
    ])
  })

  test("takes a key once its provider does, keeping only its last four characters", async () => {
    const res = await addKey({
      provider: "anthropic",
      key: GOOD_KEYS.anthropic,
    })
    expect(res.status, await res.clone().text()).toBe(201)
    const key = await res.json()
    expect(key).toMatchObject({
      provider: "anthropic",
      hint: "AbCd",
      models: ["claude-haiku-5-5", "claude-opus-5-5"],
      fromEnvironment: false,
      unreadable: false,
    })
    expect(JSON.stringify(key)).not.toContain(GOOD_KEYS.anthropic)
    // Sealed: the database alone doesn't have it.
    const secrets = await database.em.fork().find(Secret, {})
    expect(secrets).toHaveLength(1)
    expect(JSON.stringify(secrets)).not.toContain(GOOD_KEYS.anthropic)

    const ai = await serverAi()
    expect(ai.keys).toHaveLength(1)
    expect(ai.models.map((model: { ref: string }) => model.ref)).toContain(
      "anthropic:claude-opus-5-5"
    )
  })

  test("refuses a key the provider doesn't take", async () => {
    const res = await addKey({
      provider: "openai",
      key: "sk-proj-wrong-key-0000",
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe("ai_key_refused")
    expect((await serverAi()).keys).toHaveLength(1)
  })

  test("replaces a provider's key with the next", async () => {
    const first = (await serverAi()).keys[0]
    const res = await addKey({
      provider: "anthropic",
      key: `${GOOD_KEYS.anthropic}`,
    })
    expect(res.status).toBe(201)
    const keys = (await serverAi()).keys
    expect(keys).toHaveLength(1)
    expect(keys[0].id).not.toBe(first.id)
    // The old key's secret went with it.
    expect(await database.em.fork().count(Secret, {})).toBe(1)
  })

  test("takes an address on the home network, with its own models", async () => {
    const res = await addKey({
      provider: "openai-compatible",
      name: "Ollama",
      baseUrl: `${ADDRESSES.home}/`,
    })
    expect(res.status, await res.clone().text()).toBe(201)
    const address = await res.json()
    expect(address).toMatchObject({
      name: "Ollama",
      baseUrl: ADDRESSES.home,
      hint: null,
      models: ["llama3.1:8b", "qwen3"],
    })
    // The server admin's address may be on the home network.
    expect(calls.at(-1)).toMatchObject({
      url: `${ADDRESSES.home}/models`,
      options: { homeNetwork: true },
    })
    const ai = await serverAi()
    expect(ai.models).toContainEqual(
      expect.objectContaining({
        ref: `endpoint:${address.id}:llama3.1:8b`,
        name: "Ollama: llama3.1:8b",
        price: null,
      })
    )
    expect(
      (await kyle.delete(`/api/settings/server/ai/keys/${address.id}`)).status
    ).toBe(204)
  })

  test("tests a key again, and takes one off", async () => {
    const [key] = (await serverAi()).keys
    const tested = await kyle.post(
      `/api/settings/server/ai/keys/${key.id}/test`
    )
    expect(tested.status).toBe(200)
    expect((await tested.json()).testedAt).not.toBeNull()

    const other = await (
      await addKey({ provider: "google", key: GOOD_KEYS.google })
    ).json()
    expect(other.models).toEqual(["gemini-4-argon"])
    const path = `/api/settings/server/ai/keys/${other.id}`
    expect((await kyle.delete(path)).status).toBe(204)
    expect((await kyle.delete(path)).status).toBe(404)
    expect(
      (await kyle.delete("/api/settings/server/ai/keys/not-an-id")).status
    ).toBe(404)
  })

  test("saves the policy, dropping households that are gone", async () => {
    const gone = "0b8e1c52-8e6c-4c3a-9a4e-3f2d1c0b9a87"
    const res = await kyle.put("/api/settings/server/ai/policy", {
      ...DEFAULT_AI_POLICY,
      serverKeysFor: "chosen",
      households: [homeId, gone],
      monthlyLimit: 5,
      limits: { [gone]: 10 },
      tasks: ["swaps", "nutrition"],
      models: ["anthropic:claude-haiku-5-5"],
    })
    expect(res.status, await res.clone().text()).toBe(200)
    const { policy, households } = await res.json()
    expect(policy).toMatchObject({
      serverKeysFor: "chosen",
      households: [homeId],
      limits: {},
      monthlyLimit: 5,
    })
    expect(households[0]).toMatchObject({ covered: true, limit: 5 })

    const put = (change: Record<string, unknown>) =>
      kyle.put("/api/settings/server/ai/policy", {
        ...DEFAULT_AI_POLICY,
        ...change,
      })
    expect((await put({ monthlyLimit: -1 })).status).toBe(400)
    expect((await put({ models: ["nobody:model"] })).status).toBe(400)
    expect((await put({ serverKeysFor: "friends" })).status).toBe(400)
    expect((await put({})).status).toBe(200)
  })
})

describe("the server's keys from its environment", () => {
  test("show, can be tested, and can only be taken off there", async () => {
    const test = await createTestApp({
      fetcher: fakeAiFetcher(),
      env: { MERRAN_ANTHROPIC_API_KEY: GOOD_KEYS.anthropic },
    })
    try {
      const admin = await setUpServer(test.app, test.setupCode)
      const ai = await (await admin.get("/api/settings/server/ai")).json()
      expect(ai.keys).toEqual([
        expect.objectContaining({
          id: "env:anthropic",
          provider: "anthropic",
          hint: "AbCd",
          fromEnvironment: true,
        }),
      ])
      const tested = await admin.post(
        "/api/settings/server/ai/keys/env:anthropic/test"
      )
      expect(tested.status).toBe(200)
      expect((await tested.json()).models).toContain("claude-opus-5-5")
      const removed = await admin.delete(
        "/api/settings/server/ai/keys/env:anthropic"
      )
      expect(removed.status).toBe(409)
      // The AI module is on.
      const capabilities = await (await admin.get("/api/capabilities")).json()
      expect(JSON.stringify(capabilities)).toContain('"ai"')
    } finally {
      await test.close()
    }
  })
})

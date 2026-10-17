import { DEFAULT_AI_POLICY } from "@merran/shared"
import { generateText } from "ai"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../../../app.ts"
import { AppError } from "../../../../../core/errors.ts"
import { HouseholdMember } from "../../../../../database/entities/index.ts"
import type { Database } from "../../../../../database/orm.ts"
import {
  forHousehold,
  HOUSEHOLD_FILTER,
} from "../../../../../database/scope.ts"
import type { AiTarget } from "../../../../../services/ai/providers.ts"
import { useAi } from "../../../../../services/ai/run.ts"
import type { Settings } from "../../../../../services/settings/settings.ts"
import {
  ADDRESSES,
  fakeAiFetcher,
  GOOD_KEYS,
  mockAiModels,
  type FetchCall,
} from "../../../../../test/ai.ts"
import {
  account,
  createTestApp,
  inviteToken,
  join,
  setUpServer,
  TEST_ORIGIN,
  TestClient,
} from "../../../../../test/app.ts"

// A household's AI: whose key pays for each task, its own keys and models,
// and what it's spent. Kyle, the server admin, is in Home; Jamie runs the
// Cabin, which has no server admin in it, so the server's keys don't cover
// it at first. Sam is in Home, but not one of its admins.

let app: App
let database: Database
let settings: Settings
let close: () => Promise<void>
let kyle: TestClient
let jamie: TestClient
let sam: TestClient
let homeId: string
let cabinId: string
let kyleId: string
const calls: FetchCall[] = []
const fetcher = fakeAiFetcher(calls)
const targets: AiTarget[] = []
/** Providers whose keys answer as out of credit, for the tests that need it. */
const outOfCredit = new Set<string>()
const ai = mockAiModels({ input: 10_000, output: 1_000 }, targets, outOfCredit)

const householdAi = async (who: TestClient) => {
  const res = await who.get("/api/households/current/ai")
  expect(res.status, await res.clone().text()).toBe(200)
  return res.json()
}

const setPolicy = async (change: Record<string, unknown>) => {
  const res = await kyle.put("/api/settings/server/ai/policy", {
    ...DEFAULT_AI_POLICY,
    ...change,
  })
  expect(res.status, await res.clone().text()).toBe(200)
}

beforeAll(async () => {
  const test = await createTestApp({ fetcher, ai })
  ;({ app, database, settings, close } = test)
  kyle = await setUpServer(app, test.setupCode)
  homeId = (await (await kyle.get("/api/households/current")).json()).id
  kyleId = (await (await kyle.get("/api/auth/me")).json()).id
  sam = await join(app, await inviteToken(kyle), account("sam", "Sam"))

  // The Cabin: Jamie's, with no server admin in it.
  cabinId = (
    await (await kyle.post("/api/households", { name: "Cabin" })).json()
  ).id
  jamie = await join(
    app,
    await inviteToken(kyle, "admin"),
    account("jamie", "Jamie")
  )
  await kyle.post("/api/auth/organization/set-active", {
    organizationId: homeId,
  })
  const em = database.em.fork()
  em.remove(
    await em.findOneOrFail(
      HouseholdMember,
      { household: cabinId, user: kyleId },
      { filters: { [HOUSEHOLD_FILTER]: false } }
    )
  )
  await em.flush()

  const res = await kyle.post("/api/settings/server/ai/keys", {
    provider: "anthropic",
    key: GOOD_KEYS.anthropic,
  })
  expect(res.status, await res.clone().text()).toBe(201)
})

afterAll(() => close())

describe("a household's AI", () => {
  test("is the server's, for a household a server admin is in", async () => {
    const home = await householdAi(kyle)
    expect(home.status).toMatchObject({
      available: true,
      server: { covers: true, hasKeys: true, limit: null, spent: 0 },
      mayAddKeys: true,
      mayAddAddresses: false,
    })
    expect(home.status.tasks.import).toEqual({
      ok: true,
      ref: "anthropic:claude-sonnet-5-5",
      source: "server",
    })
    expect(home.status.tasks.swaps).toMatchObject({
      ref: "anthropic:claude-haiku-5-5",
    })
    expect(home.keys).toEqual([])
    expect(home.models[0]).toMatchObject({ source: "server" })
    // Anyone in it can see how it stands.
    expect((await householdAi(sam)).status.available).toBe(true)
  })

  test("isn't, at first, for another household, which can bring its own key", async () => {
    const cabin = await householdAi(jamie)
    expect(cabin.status).toMatchObject({
      available: false,
      server: { covers: false },
    })
    expect(cabin.status.tasks.import).toEqual({ ok: false, why: "notCovered" })
    expect(cabin.models).toEqual([])

    const res = await jamie.post("/api/households/current/ai/keys", {
      provider: "openai",
      key: GOOD_KEYS.openai,
    })
    expect(res.status, await res.clone().text()).toBe(201)
    const now = await householdAi(jamie)
    expect(now.keys).toMatchObject([{ provider: "openai", hint: "EfGh" }])
    expect(now.status.tasks.import).toEqual({
      ok: true,
      ref: "openai:gpt-6-sol",
      source: "household",
    })
    expect(now.status.tasks.swaps).toMatchObject({ ref: "openai:gpt-6-luna" })
    // The server's keys stay the server's.
    const server = (await (await kyle.get("/api/settings/server/ai")).json())
      .keys[0]
    expect(
      (await jamie.delete(`/api/households/current/ai/keys/${server.id}`))
        .status
    ).toBe(404)
  })

  test("only when the server admin lets households bring their own", async () => {
    await setPolicy({ householdKeys: false })
    const res = await jamie.post("/api/households/current/ai/keys", {
      provider: "google",
      key: GOOD_KEYS.google,
    })
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe("ai_keys_not_allowed")
    await setPolicy({})
  })

  test("takes a public address of its own, once the server admin allows it", async () => {
    const address = (baseUrl: string) =>
      jamie.post("/api/households/current/ai/keys", {
        provider: "openai-compatible",
        name: "Our server",
        baseUrl,
      })
    expect((await address(ADDRESSES.public)).status).toBe(403)
    await setPolicy({ householdAddresses: true })
    // Never one on a private network.
    const home = await address(ADDRESSES.home)
    expect(home.status).toBe(400)
    expect((await home.json()).error.code).toBe("private_address")
    const res = await address(ADDRESSES.public)
    expect(res.status, await res.clone().text()).toBe(201)
    expect(calls.at(-1)).toMatchObject({
      url: `${ADDRESSES.public}/models`,
      options: { homeNetwork: false },
    })
    const added = await res.json()
    expect(
      (await jamie.delete(`/api/households/current/ai/keys/${added.id}`)).status
    ).toBe(204)
    await setPolicy({})
  })

  test("goes by the models it picks, for each size and task", async () => {
    const res = await jamie.put("/api/households/current/ai", {
      large: "openai:gpt-6-astra",
      small: null,
      tasks: { swaps: "openai:gpt-6-sol" },
      monthlyLimit: 2,
    })
    expect(res.status, await res.clone().text()).toBe(200)
    const { status, settings: picked } = await res.json()
    expect(picked).toEqual({
      large: "openai:gpt-6-astra",
      small: null,
      tasks: { swaps: "openai:gpt-6-sol" },
      monthlyLimit: 2,
      autoTidy: false,
    })
    expect(status.tasks.import).toMatchObject({ ref: "openai:gpt-6-astra" })
    expect(status.tasks.swaps).toMatchObject({ ref: "openai:gpt-6-sol" })
    expect(status.tasks.nutrition).toMatchObject({ ref: "openai:gpt-6-luna" })
    expect(status.own).toEqual({ limit: 2, spent: 0, near: false })

    const bad = await jamie.put("/api/households/current/ai", {
      ...picked,
      large: "nobody:model",
    })
    expect(bad.status).toBe(400)
  })

  test("is changed by the household's admins, signed in", async () => {
    const body = { large: null, small: null, tasks: {}, monthlyLimit: null }
    expect((await sam.put("/api/households/current/ai", body)).status).toBe(403)
    expect(
      (
        await sam.post("/api/households/current/ai/keys", {
          provider: "openai",
          key: GOOD_KEYS.openai,
        })
      ).status
    ).toBe(403)
    const key = (
      await (
        await kyle.post("/api/auth/api-keys", {
          name: "Home Assistant",
          permissions: { plan: "write" },
          expiresInDays: 30,
        })
      ).json()
    ).key
    const res = await app.request(`${TEST_ORIGIN}/api/households/current/ai`, {
      headers: { authorization: `Bearer ${key}` },
    })
    expect(res.status).toBe(403)
  })
})

describe("AI calls", () => {
  const call = () =>
    useAi(
      { settings, fetcher, ai },
      forHousehold(database.em.fork(), homeId),
      { householdId: homeId, userId: kyleId, task: "import" },
      (model) => generateText({ model, prompt: "A recipe, please." })
    )

  test("go on whose key pays, and say what they took and cost", async () => {
    await setPolicy({ monthlyLimit: 0.025 })
    const result = await call()
    expect(result.text).toBe("ok")
    expect(targets.at(-1)).toMatchObject({
      provider: "anthropic",
      model: "claude-sonnet-5-5",
      apiKey: GOOD_KEYS.anthropic,
    })

    const home = await householdAi(kyle)
    // 10,000 tokens in at $2 a million, 1,000 out at $10.
    expect(home.usage.months[0].server).toBeCloseTo(0.03)
    expect(home.usage.months[0].household).toBe(0)
    expect(home.usage.tasks).toEqual([
      { task: "import", cost: expect.closeTo(0.03), calls: 1 },
    ])
    expect(home.usage.people).toEqual([
      { userId: kyleId, name: "Kyle", cost: expect.closeTo(0.03), calls: 1 },
    ])
    expect(home.status.server).toMatchObject({ limit: 0.025, near: true })

    const server = await (await kyle.get("/api/settings/server/ai")).json()
    expect(
      server.households.find((h: { id: string }) => h.id === homeId)
    ).toMatchObject({ spent: expect.closeTo(0.03), near: true })
    expect(server.usage.models).toEqual([
      expect.objectContaining({ model: "claude-sonnet-5-5", calls: 1 }),
    ])
  })

  test("stop at this month's limit on the server's keys", async () => {
    await expect(call()).rejects.toThrow(AppError)
    await expect(call()).rejects.toMatchObject({ code: "ai_overLimit" })
    const home = await householdAi(kyle)
    expect(home.status.tasks.import).toEqual({ ok: false, why: "overLimit" })
    // A higher limit for this household lets it go on.
    await setPolicy({ monthlyLimit: 0.025, limits: { [homeId]: 1 } })
    expect((await call()).text).toBe("ok")
    await setPolicy({})
  })
})

describe("a key's credit", () => {
  const call = () =>
    useAi(
      { settings, fetcher, ai },
      forHousehold(database.em.fork(), homeId),
      { householdId: homeId, userId: kyleId, task: "import" },
      (model) => generateText({ model, prompt: "A recipe, please." })
    )
  const serverClaude = async () =>
    (await (await kyle.get("/api/settings/server/ai")).json()).keys.find(
      (key: { provider: string }) => key.provider === "anthropic"
    )
  const homeOpenAi = async () =>
    (await householdAi(kyle)).keys.find(
      (key: { provider: string }) => key.provider === "openai"
    )

  test("counts down from what's entered, warning when it's low", async () => {
    const key = await serverClaude()
    const path = `/api/settings/server/ai/keys/${key.id}/credit`
    const res = await kyle.put(path, { amount: 0.035 })
    expect(res.status, await res.clone().text()).toBe(200)
    expect((await res.json()).credit).toMatchObject({
      amount: 0.035,
      spent: 0,
      left: 0.035,
    })

    // Sonnet reads a recipe for about 3¢.
    await call()
    const after = await serverClaude()
    expect(after.credit.left).toBeCloseTo(0.005)
    expect(after.lowOnCredit).toBe(true)
    // The household that relies on it hears so.
    expect((await householdAi(kyle)).status.keyAlerts).toEqual([
      {
        id: key.id,
        source: "server",
        provider: "anthropic",
        name: null,
        outOfCredit: false,
        left: expect.closeTo(0.005),
      },
    ])

    const cleared = await (await kyle.put(path, { amount: null })).json()
    expect(cleared).toMatchObject({ credit: null, lowOnCredit: false })
  })

  test("is noted when the provider says it's out, and the next key is used", async () => {
    // Home's own OpenAI key comes first.
    const added = await kyle.post("/api/households/current/ai/keys", {
      provider: "openai",
      key: GOOD_KEYS.openai,
    })
    expect(added.status, await added.clone().text()).toBe(201)
    outOfCredit.add("openai")
    expect((await call()).text).toBe("ok")
    expect(targets.at(-1)).toMatchObject({ provider: "anthropic" })

    const home = await householdAi(kyle)
    const own = home.keys.find(
      (key: { provider: string }) => key.provider === "openai"
    )
    expect(own.outOfCreditAt).not.toBeNull()
    expect(home.status.keyAlerts).toContainEqual(
      expect.objectContaining({
        id: own.id,
        source: "household",
        outOfCredit: true,
      })
    )
    // Passed over for now: the server's key does big tasks.
    expect(home.status.tasks.import).toMatchObject({ source: "server" })
  })

  test("says so when there's no other key", async () => {
    outOfCredit.add("anthropic")
    await expect(call()).rejects.toMatchObject({ code: "ai_out_of_credit" })
    expect((await serverClaude()).outOfCreditAt).not.toBeNull()
    expect((await householdAi(kyle)).status.available).toBe(false)
  })

  test("is tried again once it's topped up, or tests well", async () => {
    outOfCredit.clear()
    const key = await serverClaude()
    await kyle.put(`/api/settings/server/ai/keys/${key.id}/credit`, {
      amount: 20,
    })
    expect((await serverClaude()).outOfCreditAt).toBeNull()

    // A test checks credit with one tiny call on its cheapest model.
    const own = await homeOpenAi()
    const tested = await (
      await kyle.post(`/api/households/current/ai/keys/${own.id}/test`)
    ).json()
    expect(tested.outOfCreditAt).toBeNull()
    expect(tested.creditCheck).toEqual({ result: "ok", message: null })
    expect(targets.at(-1)).toMatchObject({
      provider: "openai",
      model: "gpt-6-luna",
    })
    outOfCredit.add("openai")
    const empty = await (
      await kyle.post(`/api/households/current/ai/keys/${own.id}/test`)
    ).json()
    expect(empty.outOfCreditAt).not.toBeNull()
    expect(empty.creditCheck).toEqual({ result: "out", message: null })
    outOfCredit.clear()
    expect((await call()).text).toBe("ok")
  })

  test("is entered by admins", async () => {
    const key = await serverClaude()
    const own = await homeOpenAi()
    expect(
      (
        await jamie.put(`/api/settings/server/ai/keys/${key.id}/credit`, {
          amount: 5,
        })
      ).status
    ).toBe(403)
    expect(
      (
        await sam.put(`/api/households/current/ai/keys/${own.id}/credit`, {
          amount: 5,
        })
      ).status
    ).toBe(403)
    expect(
      (
        await jamie.put(`/api/households/current/ai/keys/${own.id}/credit`, {
          amount: 5,
        })
      ).status
    ).toBe(404)
    expect(
      (
        await kyle.put(`/api/households/current/ai/keys/${own.id}/credit`, {
          amount: -1,
        })
      ).status
    ).toBe(400)
  })
})

// Phase 4 is done when a household the server's keys don't cover brings
// its own key and uses the assistant, and the server admin sees only what
// went on the server's keys.
describe("a household on its own key", () => {
  test("uses the assistant, and the server's spend is only the server's keys", async () => {
    const cabin = await householdAi(jamie)
    expect(cabin.status.server.covers).toBe(false)
    if (
      !cabin.keys.some((key: { provider: string }) => key.provider === "openai")
    ) {
      const added = await jamie.post("/api/households/current/ai/keys", {
        provider: "openai",
        key: GOOD_KEYS.openai,
      })
      expect(added.status, await added.clone().text()).toBe(201)
    }
    expect((await householdAi(jamie)).status.tasks.assistant).toMatchObject({
      ok: true,
      source: "household",
    })

    const chat = await (await jamie.post("/api/assistant/chats")).json()
    const res = await jamie.post(`/api/assistant/chats/${chat.id}/messages`, {
      text: "What's for dinner?",
    })
    expect(res.status, await res.clone().text()).toBe(200)
    expect(await res.text()).toContain("ok")
    expect(targets.at(-1)).toMatchObject({
      provider: "openai",
      apiKey: GOOD_KEYS.openai,
    })

    // What it spent is on its own key, once the answer's done.
    let usage = (await householdAi(jamie)).usage.months[0]
    for (let tries = 0; !usage?.household && tries < 40; tries++) {
      await new Promise((resolve) => setTimeout(resolve, 25))
      usage = (await householdAi(jamie)).usage.months[0]
    }
    expect(usage.household).toBeGreaterThan(0)
    expect(usage.server).toBe(0)

    // The server admin sees nothing of it on the server's keys.
    const server = await (await kyle.get("/api/settings/server/ai")).json()
    expect(
      server.households.find((h: { id: string }) => h.id === cabinId)
    ).toMatchObject({ covered: false, spent: 0 })
    expect(
      server.usage.models.some((m: { model: string }) =>
        m.model.startsWith("gpt-")
      )
    ).toBe(false)
  })
})

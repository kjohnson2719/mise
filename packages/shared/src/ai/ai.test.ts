import { describe, expect, test } from "vitest"
import {
  costOf,
  costPerUse,
  endpointRef,
  modelRef,
  parseModelRef,
  suggestedModel,
} from "./catalog.ts"
import {
  DEFAULT_AI_POLICY,
  nearLimit,
  NO_HOUSEHOLD_AI,
  serverKeysCover,
  serverLimitFor,
  type AiPolicy,
} from "./policy.ts"
import { resolveAi, type AiKeyInfo, type ResolveInput } from "./resolve.ts"

const ENDPOINT = "0b8e1c52-8e6c-4c3a-9a4e-3f2d1c0b9a87"

const key = (
  id: string,
  source: AiKeyInfo["source"],
  provider: AiKeyInfo["provider"],
  models: string[] | null = null
): AiKeyInfo => ({ id, source, provider, models })

/** A household with nothing of its own, on a server with a Claude key. */
function input(change: Partial<ResolveInput> = {}): ResolveInput {
  return {
    task: "import",
    householdId: "home",
    household: { keys: [], ai: NO_HOUSEHOLD_AI, spent: 0 },
    server: {
      keys: [key("server-claude", "server", "anthropic")],
      covers: true,
      spent: 0,
    },
    policy: DEFAULT_AI_POLICY,
    ...change,
  }
}

describe("models", () => {
  test("are written as one string, colons and all", () => {
    expect(modelRef("anthropic", "claude-opus-5-5")).toBe(
      "anthropic:claude-opus-5-5"
    )
    expect(parseModelRef("anthropic:claude-opus-5-5")).toEqual({
      kind: "keyed",
      provider: "anthropic",
      model: "claude-opus-5-5",
    })
    // An address's model names can have colons in them.
    expect(parseModelRef(endpointRef(ENDPOINT, "llama3.1:8b"))).toEqual({
      kind: "endpoint",
      endpoint: ENDPOINT,
      model: "llama3.1:8b",
    })
    expect(parseModelRef("nobody:model")).toBeNull()
    expect(parseModelRef("anthropic:")).toBeNull()
    expect(parseModelRef("endpoint:abc")).toBeNull()
  })

  test("suggest the right size for each task, and say what a use costs", () => {
    expect(suggestedModel("anthropic", "import")).toBe("claude-sonnet-5-5")
    expect(suggestedModel("anthropic", "swaps")).toBe("claude-haiku-5-5")
    expect(suggestedModel("openai", "assistant")).toBe("gpt-6-sol")
    // A recipe read by Sonnet: 8,000 in at $2 a million, 1,500 out at $10.
    expect(costPerUse([2, 10], "import")).toBeCloseTo(0.031)
    // By Opus, twice that.
    expect(costPerUse([4, 20], "import")).toBeCloseTo(0.062)
    // A swap by Haiku, a sliver of a cent.
    expect(costPerUse([0.1, 0.5], "swaps")).toBeLessThan(0.001)
  })

  test("cost what they cost, an address of one's own nothing", () => {
    // $4 in and $20 out a million tokens.
    expect(costOf("anthropic", "claude-opus-5-5", 10_000, 1_000)).toBeCloseTo(
      0.06
    )
    expect(costOf("openai-compatible", "llama3.1", 10_000, 1_000)).toBe(0)
    // Not known: no cost, rather than a wrong one.
    expect(costOf("openai", "gpt-9-nova", 10_000, 1_000)).toBeNull()
  })
})

describe("the policy", () => {
  test("covers the server admins' households at first", () => {
    expect(serverKeysCover(DEFAULT_AI_POLICY, "home", true)).toBe(true)
    expect(serverKeysCover(DEFAULT_AI_POLICY, "cabin", false)).toBe(false)
    const chosen = { serverKeysFor: "chosen" as const, households: ["cabin"] }
    expect(serverKeysCover(chosen, "cabin", false)).toBe(true)
    expect(serverKeysCover(chosen, "home", true)).toBe(false)
    expect(
      serverKeysCover({ serverKeysFor: "all", households: [] }, "x", false)
    ).toBe(true)
    expect(
      serverKeysCover({ serverKeysFor: "none", households: [] }, "x", true)
    ).toBe(false)
  })

  test("limits each household, or one of them its own way", () => {
    const policy = { monthlyLimit: 5, limits: { cabin: 20 } }
    expect(serverLimitFor(policy, "home")).toBe(5)
    expect(serverLimitFor(policy, "cabin")).toBe(20)
    expect(serverLimitFor({ monthlyLimit: null, limits: {} }, "home")).toBe(
      null
    )
    expect(nearLimit(4, 5)).toBe(true)
    expect(nearLimit(3.9, 5)).toBe(false)
    expect(nearLimit(100, null)).toBe(false)
  })
})

describe("whose key pays", () => {
  test("the server's, for a household it covers, with the task's size of model", () => {
    expect(resolveAi(input())).toMatchObject({
      ok: true,
      key: { id: "server-claude" },
      ref: "anthropic:claude-sonnet-5-5",
    })
    expect(resolveAi(input({ task: "swaps" }))).toMatchObject({
      ok: true,
      ref: "anthropic:claude-haiku-5-5",
    })
  })

  test("the household's own first", () => {
    const own = key("home-openai", "household", "openai")
    expect(
      resolveAi(
        input({ household: { keys: [own], ai: NO_HOUSEHOLD_AI, spent: 0 } })
      )
    ).toMatchObject({
      ok: true,
      key: { id: "home-openai" },
      ref: "openai:gpt-6-sol",
    })
  })

  test("the model picked, by task, then by size", () => {
    const ai = {
      ...NO_HOUSEHOLD_AI,
      large: "anthropic:claude-sonnet-5-5",
      tasks: { import: "anthropic:claude-fable-5-1" },
    }
    const household = { keys: [], ai, spent: 0 }
    expect(resolveAi(input({ household }))).toMatchObject({
      ref: "anthropic:claude-fable-5-1",
      model: "claude-fable-5-1",
    })
    expect(resolveAi(input({ household, task: "tidy" }))).toMatchObject({
      ref: "anthropic:claude-sonnet-5-5",
    })
    // Picked, with no key for it anywhere.
    expect(
      resolveAi(
        input({
          household: {
            keys: [],
            ai: { ...ai, large: "openai:gpt-6-sol" },
            spent: 0,
          },
          task: "tidy",
        })
      )
    ).toEqual({ ok: false, why: "noKey" })
  })

  test("the server's defaults, for a household that hasn't picked", () => {
    const policy = {
      ...DEFAULT_AI_POLICY,
      large: "anthropic:claude-sonnet-5-5",
    }
    expect(resolveAi(input({ policy }))).toMatchObject({
      ref: "anthropic:claude-sonnet-5-5",
    })
  })

  test("an address, with its own models", () => {
    const ollama = key(ENDPOINT, "server", "openai-compatible", [
      "llama3.1:8b",
      "qwen3",
    ])
    expect(
      resolveAi(input({ server: { keys: [ollama], covers: true, spent: 0 } }))
    ).toMatchObject({
      ok: true,
      ref: `endpoint:${ENDPOINT}:llama3.1:8b`,
      model: "llama3.1:8b",
    })
    // Not tested yet, so no models to run.
    const untested = key(ENDPOINT, "server", "openai-compatible")
    expect(
      resolveAi(input({ server: { keys: [untested], covers: true, spent: 0 } }))
    ).toEqual({ ok: false, why: "noKey" })
  })

  test("nobody's, when the server's keys don't cover the household, task or model", () => {
    expect(
      resolveAi(input({ server: { ...input().server, covers: false } }))
    ).toEqual({ ok: false, why: "notCovered" })
    const smallOnly: AiPolicy = { ...DEFAULT_AI_POLICY, tasks: ["swaps"] }
    expect(resolveAi(input({ policy: smallOnly }))).toEqual({
      ok: false,
      why: "notCovered",
    })
    expect(
      resolveAi(input({ policy: smallOnly, task: "swaps" }))
    ).toMatchObject({
      ok: true,
    })
    const haikuOnly: AiPolicy = {
      ...DEFAULT_AI_POLICY,
      models: ["anthropic:claude-haiku-5-5"],
    }
    expect(resolveAi(input({ policy: haikuOnly }))).toEqual({
      ok: false,
      why: "notCovered",
    })
  })

  test("nobody's, over this month's limit on the server's keys", () => {
    const policy: AiPolicy = { ...DEFAULT_AI_POLICY, monthlyLimit: 5 }
    const spent = (amount: number) => ({ ...input().server, spent: amount })
    expect(resolveAi(input({ policy, server: spent(4.9) }))).toMatchObject({
      ok: true,
    })
    // What this call would cost counts too.
    expect(
      resolveAi(input({ policy, server: spent(4.9), estimate: 0.2 }))
    ).toEqual({ ok: false, why: "overLimit" })
    // A household with a limit of its own.
    expect(
      resolveAi(
        input({
          policy: { ...policy, limits: { home: 10 } },
          server: spent(6),
        })
      )
    ).toMatchObject({ ok: true })
  })

  test("the server's, once the household's own keys reach their limit", () => {
    const own = key("home-claude", "household", "anthropic")
    const ai = { ...NO_HOUSEHOLD_AI, monthlyLimit: 2 }
    expect(
      resolveAi(input({ household: { keys: [own], ai, spent: 2.5 } }))
    ).toMatchObject({ ok: true, key: { id: "server-claude" } })
    expect(
      resolveAi(
        input({
          household: { keys: [own], ai, spent: 2.5 },
          server: { ...input().server, covers: false },
        })
      )
    ).toEqual({ ok: false, why: "ownLimit" })
  })
})

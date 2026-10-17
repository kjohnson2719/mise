import { describe, expect, test } from "vitest"
import { KeyRateLimit } from "./key-rate-limit.ts"

describe("an API key's rate limit", () => {
  test("lets requests through up to the limit, then says when to retry", () => {
    const limit = new KeyRateLimit(3, 60_000)
    const start = 1_000_000

    expect(limit.hit("key", start).ok).toBe(true)
    expect(limit.hit("key", start + 1).ok).toBe(true)
    expect(limit.hit("key", start + 2).ok).toBe(true)
    expect(limit.hit("key", start + 30_000)).toEqual({
      ok: false,
      retryAfter: 30,
    })
  })

  test("starts again when the window has passed", () => {
    const limit = new KeyRateLimit(1, 60_000)

    expect(limit.hit("key", 0).ok).toBe(true)
    expect(limit.hit("key", 1).ok).toBe(false)
    expect(limit.hit("key", 60_000).ok).toBe(true)
  })

  test("counts each key on its own", () => {
    const limit = new KeyRateLimit(1, 60_000)

    expect(limit.hit("one", 0).ok).toBe(true)
    expect(limit.hit("two", 0).ok).toBe(true)
  })
})

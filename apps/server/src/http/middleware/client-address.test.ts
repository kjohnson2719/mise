import { describe, expect, test } from "vitest"
import { resolveClientAddress, trustedProxies } from "./client-address.ts"

const none = trustedProxies([])
const proxies = trustedProxies(["172.16.0.0/12", "127.0.0.1"])

describe("the client's address", () => {
  test("is the connection's, when there's no trusted proxy", () => {
    expect(resolveClientAddress("203.0.113.9", "198.51.100.1", none)).toBe(
      "203.0.113.9"
    )
  })

  test("ignores X-Forwarded-For from anyone not trusted", () => {
    expect(resolveClientAddress("203.0.113.9", "198.51.100.1", proxies)).toBe(
      "203.0.113.9"
    )
  })

  test("believes a trusted proxy", () => {
    expect(resolveClientAddress("172.18.0.2", "198.51.100.1", proxies)).toBe(
      "198.51.100.1"
    )
  })

  test("walks back through more than one trusted proxy", () => {
    expect(
      resolveClientAddress(
        "127.0.0.1",
        "198.51.100.1, 203.0.113.50, 172.18.0.5",
        proxies
      )
    ).toBe("203.0.113.50")
  })

  test("understands IPv4 addresses written as IPv6", () => {
    expect(
      resolveClientAddress("::ffff:172.18.0.2", "198.51.100.1", proxies)
    ).toBe("198.51.100.1")
  })
})

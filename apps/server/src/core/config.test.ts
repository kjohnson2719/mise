import { describe, expect, test } from "vitest"
import { loadConfig } from "./config.ts"

describe("settings", () => {
  test("nothing needs setting", () => {
    const config = loadConfig({})

    expect(config.port).toBe(3000)
    expect(config.logLevel).toBe("info")
    expect(config.version).toMatch(/^\d+\.\d+\.\d+/)
  })

  test("an empty variable counts as not set", () => {
    expect(loadConfig({ PORT: "" }).port).toBe(3000)
  })

  test("values are read and checked", () => {
    const config = loadConfig({
      PORT: "8080",
      MERRAN_LOG_LEVEL: "debug",
      MERRAN_LOG_FORMAT: "json",
    })

    expect(config).toMatchObject({
      port: 8080,
      logLevel: "debug",
      logFormat: "json",
    })
  })

  test("everything wrong is listed at once", () => {
    expect(() =>
      loadConfig({ PORT: "eighty", MERRAN_LOG_LEVEL: "loud" })
    ).toThrow(/PORT[\s\S]*MERRAN_LOG_LEVEL/)
  })

  test("module settings set in the environment are kept, to lock them", () => {
    const config = loadConfig({
      MERRAN_SENTRY_ENVIRONMENT: "nas",
      MERRAN_TELEMETRY: "off",
    })

    expect(Object.fromEntries(config.fromEnv)).toEqual({
      "errorTracking.environment": "nas",
      "telemetry.enabled": false,
    })
  })

  test("module settings are checked at startup too", () => {
    expect(() =>
      loadConfig({ PORT: "eighty", MERRAN_SENTRY_SAMPLE_RATE: "2" })
    ).toThrow(/PORT[\s\S]*MERRAN_SENTRY_SAMPLE_RATE: Use a number from 0 to 1/)
  })

  test("trusted proxies are a list of addresses and ranges", () => {
    expect(
      loadConfig({ MERRAN_TRUSTED_PROXIES: "172.16.0.0/12, 127.0.0.1" })
        .trustedProxies
    ).toEqual(["172.16.0.0/12", "127.0.0.1"])
    expect(() => loadConfig({ MERRAN_TRUSTED_PROXIES: "my-proxy" })).toThrow(
      /MERRAN_TRUSTED_PROXIES/
    )
  })
})

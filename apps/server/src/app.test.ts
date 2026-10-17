import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "./app.ts"
import { createTestApp } from "./test/app.ts"
import { testDatabaseKind } from "./test/database.ts"

let app: App
let close: () => Promise<void>

beforeAll(async () => {
  ;({ app, close } = await createTestApp())
})

afterAll(() => close())

describe("the app", () => {
  test("health says the server is up, with its version", async () => {
    const res = await app.request("/api/health")

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      status: "ok",
      version: expect.any(String),
    })
  })

  test("ready says the database answers and is up to date", async () => {
    const res = await app.request("/api/health/ready")

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      status: "ready",
      database: testDatabaseKind,
    })
  })

  test("every response carries a request id", async () => {
    const res = await app.request("/api/health")

    expect(res.headers.get("x-request-id")).toBeTruthy()
  })

  test("an unknown address gets the standard error", async () => {
    const res = await app.request("/api/nothing-here")

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({
      error: { code: "not_found", message: expect.any(String) },
    })
  })

  test("the OpenAPI spec lists the routes, the error shape and sign-in", async () => {
    const res = await app.request("/api/openapi.json")
    const spec = (await res.json()) as {
      openapi: string
      paths: Record<string, unknown>
      components: {
        schemas: Record<string, unknown>
        securitySchemes: Record<string, unknown>
      }
    }

    expect(spec.openapi).toBe("3.1.0")
    expect(Object.keys(spec.paths)).toEqual(
      expect.arrayContaining([
        "/api/health",
        "/api/auth/setup",
        "/api/auth/me",
        "/api/auth/join/{token}",
        "/api/households/current",
        "/api/households/current/members/{memberId}",
      ])
    )
    expect(spec.components.schemas).toHaveProperty("Error")
    expect(spec.components.securitySchemes).toHaveProperty("session")
  })

  test("the API reference page is served", async () => {
    const res = await app.request("/api/docs")

    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/html")
  })
})

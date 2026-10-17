import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../app.ts"
import { describedRoutes, type Operation } from "../../test/api-reference.ts"
import {
  createTestApp,
  setUpServer,
  TEST_ORIGIN,
  type TestClient,
} from "../../test/app.ts"
import { IDS } from "../schemas/examples.ts"
import { KEY_PERMISSION } from "./auth.ts"

let app: App
let close: () => Promise<void>
let kyle: TestClient
/** A key with no permissions at all. */
let bareKey: string

beforeAll(async () => {
  const test = await createTestApp()
  ;({ app, close } = test)
  kyle = await setUpServer(app, test.setupCode)
  const res = await kyle.post("/api/auth/api-keys", {
    name: "Nothing allowed",
    permissions: {},
    expiresInDays: 30,
  })
  bareKey = (await res.json()).key
})

afterAll(() => close())

/** A request sent with an API key, with the body as JSON. */
function withKey(key: string, method: string, path: string, body?: unknown) {
  return app.request(`${TEST_ORIGIN}/api${path}`, {
    method,
    headers: {
      authorization: `Bearer ${key}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

/**
 * Path parameters filled in, a recipe by its slug and anything else by an
 * id; and the query a route can't do without, from its examples.
 */
const pathOf = (path: string, operation: Operation) => {
  const filled = path.replace(/\{(\w+)\}/g, (_, name: string) =>
    name === "recipe" ? "lemon-chicken" : IDS.lemonChicken
  )
  const query = new URLSearchParams(
    (operation.parameters ?? [])
      .filter((param) => param.in === "query" && param.required)
      .map((param): [string, string] => [
        param.name,
        String(param.example ?? param.schema?.example ?? ""),
      ])
  ).toString()
  return query ? `${filled}?${query}` : filled
}

// openToKeys() puts a route's permission in the API reference and hands the
// same one to inHousehold(). A key without it must be turned away, by name:
// that shows the route really checks the permission the reference shows.
const openToKeys = describedRoutes().filter(
  ({ route }) =>
    typeof route[KEY_PERMISSION] === "string" && route[KEY_PERMISSION] !== "any"
)

describe("routes open to API keys", () => {
  test("there are some", () => {
    expect(openToKeys.length).toBeGreaterThan(0)
  })

  test.each(openToKeys.map((d) => [d.name, d] as const))(
    "%s turns away a key without its permission",
    async (_, { route, operation, example }) => {
      const json = operation.requestBody?.content?.["application/json"]
      const res = await withKey(
        bareKey,
        route.method.toUpperCase(),
        pathOf(route.path, operation),
        json ? example(json) : undefined
      )

      const permission = String(route[KEY_PERMISSION])
      expect(res.status).toBe(403)
      expect(await res.json()).toMatchObject({
        error: {
          code: "missing_permission",
          message:
            permission === "any:read"
              ? "This API key can't read anything."
              : `This API key can't ${permission.replace(/^(\w+):(\w+)$/, "$2 $1")}.`,
        },
      })
    }
  )

  test("a route open to any key lets in one with no permissions", async () => {
    const res = await withKey(bareKey, "GET", "/auth/api-keys/current")

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ permissions: {} })
  })
})

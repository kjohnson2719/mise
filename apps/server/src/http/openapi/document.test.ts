import { readFileSync } from "node:fs"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../app.ts"
import {
  exampleIn,
  type Media,
  type Operation,
} from "../../test/api-reference.ts"
import { createTestApp, TestClient } from "../../test/app.ts"
import { createOpenApiFile } from "./file.ts"

let app: App
let close: () => Promise<void>

beforeAll(async () => {
  ;({ app, close } = await createTestApp())
})

afterAll(() => close())

describe("the API reference", () => {
  test("the saved openapi.json is up to date", async () => {
    // If this fails, the API changed: run `pnpm openapi` and commit the file.
    const saved = readFileSync(
      new URL("./openapi.json", import.meta.url),
      "utf8"
    )
    expect(saved).toBe(await createOpenApiFile())
  })

  test("includes signing in, and nothing of Better Auth's that's shut", async () => {
    const spec = (await (await app.request("/api/openapi.json")).json()) as {
      paths: Record<string, unknown>
    }
    const paths = Object.keys(spec.paths)

    expect(paths).toEqual(
      expect.arrayContaining([
        "/api/auth/sign-in/username",
        "/api/auth/sign-out",
        "/api/auth/organization/set-active",
      ])
    )
    expect(paths.filter((path) => path.includes("/admin/"))).toEqual([])
    expect(paths).not.toContain("/api/auth/organization/delete")
  })

  // Merran's own routes are checked in routes.test.ts; these hold the whole
  // published file to the same, Better Auth's endpoints included.
  test("every operation has a summary, and an operationId of its own", async () => {
    const operations = Object.entries(await published())
    for (const [name, operation] of operations) {
      expect(operation.summary, `${name} needs a summary`).toBeTruthy()
      expect(operation.operationId, `${name} needs an id`).toMatch(
        /^[a-z][a-zA-Z]+$/
      )
    }
    const ids = operations.map(([, operation]) => operation.operationId)
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([])
  })

  test("every JSON body and answer has an example", async () => {
    const missing: string[] = []
    for (const [name, operation] of Object.entries(await published())) {
      const shown: [string, Media | undefined][] = [
        ["body", operation.requestBody?.content?.["application/json"]],
        ...Object.entries(operation.responses ?? {})
          .filter(([code]) => code.startsWith("2"))
          .map(
            ([code, response]) =>
              [code, response.content?.["application/json"]] as [
                string,
                Media | undefined,
              ]
          ),
      ]
      for (const [what, media] of shown) {
        if (media && exampleIn(media, schemas) === undefined) {
          missing.push(`${name} ${what}`)
        }
      }
    }
    expect(missing).toEqual([])
  })
})

let schemas: Record<string, unknown> = {}
let operations: Record<string, Operation> | undefined

/** Every operation in the saved openapi.json, by method and path. */
async function published() {
  if (operations) return operations
  const spec = JSON.parse(await createOpenApiFile()) as {
    paths: Record<string, Record<string, Operation>>
    components?: { schemas?: Record<string, unknown> }
  }
  schemas = spec.components?.schemas ?? {}
  operations = {}
  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      operations[`${method.toUpperCase()} ${path}`] = operation
    }
  }
  return operations
}

describe("Better Auth endpoints Merran doesn't use", () => {
  test.each([
    ["POST", "/api/auth/organization/delete"],
    ["POST", "/api/auth/organization/update-member-role"],
    ["POST", "/api/auth/organization/invite-member"],
    ["GET", "/api/auth/admin/list-users"],
    ["POST", "/api/auth/admin/impersonate-user"],
    ["POST", "/api/auth/sign-up/email"],
    ["GET", "/api/auth/open-api/generate-schema"],
    ["GET", "/api/auth/reference"],
  ])("%s %s isn't there", async (method, path) => {
    const body = method === "GET" ? undefined : {}
    const res = await new TestClient(app).request(method, path, body)

    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ error: { code: "not_found" } })
  })
})

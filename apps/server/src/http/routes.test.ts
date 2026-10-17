import { readdirSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { z } from "@hono/zod-openapi"
import { describe, expect, test } from "vitest"
import type { AppDeps } from "../core/context.ts"
import { API_AREAS } from "../services/auth/api-keys.ts"
import { describedRoutes, type Media } from "../test/api-reference.ts"
import { KEY_PERMISSION } from "./middleware/auth.ts"
import { createRouter, type RegisterRoutes } from "./router.ts"
import registerAllRoutes from "./routes/index.ts"

// The routes folder mirrors the API: each part of a route's path is a
// folder, a `{param}` is `[param]`, and each method is a file in the folder,
// named after it. So PATCH /api/households/current/members/{memberId} lives
// in routes/households/current/members/[memberId]/patch.ts. Each folder's
// index.ts only registers its routes and its subfolders' index.ts, fixed
// paths before `[param]` ones. auth/better-auth.ts is a registration file
// too: it hands the Better Auth endpoints Merran uses to Better Auth,
// rather than defining routes itself.

const ROUTES = fileURLToPath(new URL("./routes/", import.meta.url))

/** Files that register routes rather than being one. */
const REGISTRATION_FILES = ["auth/better-auth.ts"]
const isIndex = (name: string) =>
  name === "index.ts" || name.endsWith("/index.ts")

/** Registering only reads deps inside handlers, so none are needed here. */
const deps = {} as AppDeps

function routeFiles(folder = ROUTES, prefix = ""): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const name = `${prefix}${entry.name}`
    if (entry.isDirectory()) {
      return routeFiles(join(folder, entry.name), `${name}/`)
    }
    const isRoute =
      entry.name.endsWith(".ts") &&
      !isIndex(name) &&
      !REGISTRATION_FILES.includes(name) &&
      !entry.name.endsWith(".test.ts")
    return isRoute ? [name] : []
  })
}

function routesIn(register: RegisterRoutes) {
  const router = createRouter()
  register(router, deps)
  return router.openAPIRegistry.definitions.flatMap((definition) =>
    definition.type === "route"
      ? [{ method: definition.route.method, path: definition.route.path }]
      : []
  )
}

/** Where a route's file belongs, from its method and path. */
function fileFor({ method, path }: { method: string; path: string }) {
  const route = path.replace(/^\//, "").replace(/\{(\w+)\}/g, "[$1]")
  return `${route}/${method}.ts`
}

describe("the routes folder", () => {
  test.each(routeFiles())(
    "%s holds one route, at the path its place says",
    async (file) => {
      const url = pathToFileURL(join(ROUTES, ...file.split("/")))
      const { default: register } = (await import(url.href)) as {
        default: RegisterRoutes
      }

      const routes = routesIn(register)
      expect(routes, `${file} should define exactly one route`).toHaveLength(1)
      expect(fileFor(routes[0]!)).toBe(file)
    }
  )

  test("every route file is registered, through the index files", () => {
    const registered = routesIn(registerAllRoutes).map(fileFor).sort()

    expect(registered).toEqual(routeFiles().sort())
  })
})

// The docs site's API reference is generated from these routes, so each
// route says enough to make a good page: a summary, an operationId (its
// link, and its method name in a generated client), which API keys may use
// it, and examples that are right.

const described = describedRoutes()
const PERMISSION = new RegExp(
  `^((${API_AREAS.join("|")}):(read|write)|any:read)$`
)

describe("the API reference", () => {
  test("every route has a summary, and an operationId of its own", () => {
    for (const { name, route } of described) {
      expect(route.summary, `${name} needs a summary`).toBeTruthy()
      expect(
        route.operationId,
        `${name} needs an id, like listRecipes`
      ).toMatch(/^[a-z][a-zA-Z]+$/)
    }
    const ids = described.map(({ route }) => route.operationId)
    const twice = ids.filter((id, i) => ids.indexOf(id) !== i)
    expect(twice, "operationIds used twice").toEqual([])
  })

  test.each(described.map((d) => [d.name, d] as const))(
    "%s says which API keys may use it",
    (_, { route }) => {
      const schemes = (route.security ?? []).flatMap(Object.keys)
      const permission = route[KEY_PERMISSION]
      if (!schemes.includes("apiKey")) {
        expect(permission, "Only a route open to keys names one").toBe(
          undefined
        )
      } else if (schemes.includes("session")) {
        expect(
          permission,
          "Use openToKeys(area, access), or OPEN_TO_READERS"
        ).toMatch(PERMISSION)
      } else {
        expect(permission, "A route only for keys is OPEN_TO_ANY_KEY").toBe(
          "any"
        )
      }
    }
  )

  test.each(described.map((d) => [d.name, d] as const))(
    "%s has an example of each JSON body and answer, and they fit",
    (_, { route, operation, example }) => {
      type Content = Record<string, { schema?: unknown }> | undefined
      const shown: [string, Content, Record<string, Media> | undefined][] = [
        [
          "The request body",
          route.request?.body?.content as Content,
          operation.requestBody?.content,
        ],
        ...Object.entries(route.responses)
          .filter(([code]) => code.startsWith("2"))
          .map(
            ([code, response]) =>
              [
                `The ${code} answer`,
                ("content" in response ? response.content : {}) as Content,
                operation.responses?.[code]?.content,
              ] as [string, Content, Record<string, Media> | undefined]
          ),
      ]
      for (const [what, defined, inReference] of shown) {
        const schema = defined?.["application/json"]?.schema
        if (!(schema instanceof z.ZodType)) continue
        const value = example(inReference?.["application/json"])
        expect(value, `${what} needs an example`).not.toBe(undefined)
        expect(
          schema.safeParse(value).error?.issues,
          `${what}'s example doesn't fit its schema`
        ).toBe(undefined)
      }
    }
  )
})

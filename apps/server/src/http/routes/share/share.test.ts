import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../app.ts"
import { AppError } from "../../../core/errors.ts"
import type { Fetcher } from "../../../services/fetch/public-fetch.ts"
import {
  createTestApp,
  setUpServer,
  TEST_ORIGIN,
  TestClient,
  type TestResponse,
} from "../../../test/app.ts"

// Sharing to Merran, as Android's share sheet (signed in) and an iPhone
// Shortcut (with a key that can only import) do it.

const SOUP_PAGE = `<!doctype html><html><head><title>Tomato Soup</title>
<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Recipe",
  name: "Tomato Soup",
  recipeIngredient: ["1 onion", "2 cans tomatoes"],
  recipeInstructions: [{ "@type": "HowToStep", text: "Simmer." }],
})}</script></head><body></body></html>`

const fetcher: Fetcher = async (url) => {
  const pages: Record<string, string> = {
    "https://example.com/soup": SOUP_PAGE,
    "https://example.com/blog": "<html><body>Ten kitchen tips</body></html>",
  }
  const page = pages[url]
  if (!page) {
    throw new AppError(
      "upstream",
      "site_unreachable",
      "Couldn't reach that site."
    )
  }
  return {
    url,
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: Buffer.from(page),
  }
}

let app: App
let close: () => Promise<void>
let kyle: TestClient

beforeAll(async () => {
  const test = await createTestApp({ fetcher })
  ;({ app, close } = test)
  kyle = await setUpServer(app, test.setupCode)
})

afterAll(() => close())

const share = (body: unknown) => kyle.post("/api/share", body)

/** A form, as a Shortcut or the share sheet sends one. */
async function form(fields: Record<string, string | Blob>) {
  const data = new FormData()
  for (const [name, value] of Object.entries(fields)) data.append(name, value)
  const request = new Request(TEST_ORIGIN, { method: "POST", body: data })
  return {
    body: new Uint8Array(await request.arrayBuffer()),
    type: request.headers.get("content-type")!,
  }
}

async function makeKey(permissions: Record<string, string>) {
  const res = await kyle.post("/api/auth/api-keys", {
    name: "iPhone Shortcut",
    permissions,
    expiresInDays: null,
  })
  return (await res.json()).key as string
}

const withKey = async (
  key: string,
  path: string,
  method = "GET",
  body?: unknown
): Promise<TestResponse> =>
  app.request(`${TEST_ORIGIN}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${key}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

describe("sharing a link", () => {
  test("adds its recipe, and says so in words", async () => {
    const res = await share({
      title: "Tomato Soup",
      text: "Making this tonight! https://example.com/soup",
    })
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({
      outcome: "added",
      code: null,
      message: "Added Tomato Soup to Merran.",
      recipe: { slug: "tomato-soup", name: "Tomato Soup" },
      url: `${TEST_ORIGIN}/recipes/tomato-soup`,
    })
  })

  test("again, from a Shortcut's .webloc, gives back the same recipe", async () => {
    const webloc = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict><key>URL</key><string>https://example.com/soup</string></dict></plist>`
    const { body, type } = await form({
      file: new File([webloc], "Tomato Soup.webloc"),
    })
    const res = await kyle.send("POST", "/api/share", { body, type })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      outcome: "already",
      message: "Tomato Soup is in Merran already.",
      recipe: { slug: "tomato-soup" },
    })
  })

  test("that can't be added says why, without being an error", async () => {
    const cases: [unknown, string][] = [
      [{ text: "https://example.com/blog" }, "no_recipe_data"],
      [{ text: "https://example.com/gone" }, "site_unreachable"],
      [{ text: "4 chicken thighs, 2 lemons" }, "no_recipe"],
      [{}, "nothing_shared"],
    ]
    for (const [body, code] of cases) {
      const res = await share(body)
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({
        outcome: "failed",
        code,
        message: expect.any(String),
        recipe: null,
        url: null,
      })
    }
  })

  test("as plain text works too", async () => {
    const res = await kyle.send("POST", "/api/share", {
      body: "https://example.com/soup",
      type: "text/plain",
    })
    expect((await res.json()).outcome).toBe("already")
  })
})

describe("the Shortcut's key", () => {
  test("can share, and do nothing else", async () => {
    const key = await makeKey({ imports: "write" })
    const res = await withKey(key, "/api/share", "POST", {
      text: "https://example.com/soup",
    })
    expect(res.status).toBe(200)
    expect((await res.json()).outcome).toBe("already")

    expect((await withKey(key, "/api/recipes")).status).toBe(403)
  })

  test("is needed: a key for recipes alone can't share", async () => {
    const key = await makeKey({ recipes: "write" })
    const res = await withKey(key, "/api/share", "POST", {
      text: "https://example.com/soup",
    })
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe("missing_permission")
  })
})

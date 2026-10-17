import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../../../app.ts"
import { AppError } from "../../../../../core/errors.ts"
import type { Fetcher } from "../../../../../services/fetch/public-fetch.ts"
import type { JobRunner } from "../../../../../services/jobs/runner.ts"
import {
  createTestApp,
  setUpServer,
  TEST_ORIGIN,
  TestClient,
  type TestResponse,
} from "../../../../../test/app.ts"

// Several links at once: checked, then imported one at a time as a job.

const recipePage = (name: string, ingredient: string) =>
  `<!doctype html><html><head><title>${name}</title>
<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Recipe",
    name,
    recipeIngredient: [ingredient],
    recipeInstructions: [{ "@type": "HowToStep", text: "Cook it." }],
  })}</script></head><body></body></html>`

const PAGES: Record<string, string> = {
  "https://example.com/soup": recipePage("Tomato Soup", "2 cans tomatoes"),
  "https://example.com/bread": recipePage("Soda Bread", "500 g flour"),
  "https://example.com/rice": recipePage("Garlic Rice", "1 cup rice"),
  "https://example.com/blog": "<html><body>Ten kitchen tips</body></html>",
}

const fetcher: Fetcher = async (url) => {
  const page = PAGES[url]
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
let jobs: JobRunner
let kyle: TestClient

beforeAll(async () => {
  const test = await createTestApp({ fetcher })
  ;({ app, close, jobs } = test)
  kyle = await setUpServer(app, test.setupCode)
})

afterAll(() => close())

const start = async (body: unknown) => {
  const res = await kyle.post("/api/recipes/import/links", body)
  expect(res.status).toBe(202)
  return res.json()
}
const status = async (id: string) =>
  (await kyle.get(`/api/recipes/import/links/${id}`)).json()

describe("several links", () => {
  test("are checked, tidied and counted before importing", async () => {
    const res = await kyle.post("/api/recipes/import/links/check", {
      text: "Try: https://example.com/soup?utm_source=x, https://example.com/soup\nand https://www.tiktok.com/@cook/video/1 and not-a-link",
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      links: [
        { url: "https://example.com/soup", video: false, existing: null },
        {
          url: "https://www.tiktok.com/@cook/video/1",
          video: true,
          existing: null,
        },
      ],
      more: 0,
    })
  })

  test("come in one at a time, tagged, saying how each went", async () => {
    const started = await start({
      urls: [
        "https://example.com/soup",
        "https://example.com/bread",
        "https://example.com/blog",
      ],
      tag: "to try",
    })
    // Each link shows at once, waiting.
    expect(started).toMatchObject({
      status: "queued",
      tag: "to try",
      total: 3,
      done: 0,
      items: [
        { url: "https://example.com/soup", state: "waiting" },
        { url: "https://example.com/bread", state: "waiting" },
        { url: "https://example.com/blog", state: "waiting" },
      ],
    })
    const going = await (await kyle.get("/api/recipes/import/links")).json()
    expect(going.imports.map((i: { id: string }) => i.id)).toEqual([started.id])

    await jobs.drain()
    expect(await status(started.id)).toMatchObject({
      status: "done",
      total: 3,
      done: 3,
      added: 2,
      already: 0,
      failed: 1,
      items: [
        {
          state: "added",
          recipe: { slug: "tomato-soup", name: "Tomato Soup" },
          error: null,
        },
        { state: "added", recipe: { slug: "soda-bread" } },
        {
          state: "failed",
          recipe: null,
          error: expect.stringContaining("no recipe"),
        },
      ],
    })
    const soup = await (await kyle.get("/api/recipes/tomato-soup")).json()
    expect(soup.tags).toContain("to try")
    // Finished, so no longer listed.
    expect(
      (await (await kyle.get("/api/recipes/import/links")).json()).imports
    ).toEqual([])
  })

  test("already in the library aren't added again, or tagged", async () => {
    const started = await start({
      urls: ["https://example.com/soup"],
      tag: "again",
    })
    await jobs.drain()
    expect(await status(started.id)).toMatchObject({
      added: 0,
      already: 1,
      items: [{ state: "already", recipe: { slug: "tomato-soup" } }],
    })
    const soup = await (await kyle.get("/api/recipes/tomato-soup")).json()
    expect(soup.tags).not.toContain("again")
  })

  test("can be stopped, keeping the ones it got to", async () => {
    const started = await start({
      urls: ["https://example.com/rice", "https://example.com/bread"],
    })
    const res = await kyle.post(`/api/recipes/import/links/${started.id}/stop`)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      status: "cancelled",
      stopped: 2,
      items: [{ state: "stopped" }, { state: "stopped" }],
    })
    await jobs.drain()
    expect((await kyle.get("/api/recipes/garlic-rice")).status).toBe(404)
  })

  test("need at least one link Merran can fetch", async () => {
    const res = await kyle.post("/api/recipes/import/links", {
      urls: ["not a link", "ftp://example.com/soup"],
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe("no_links")
    expect(
      (
        await kyle.get(
          "/api/recipes/import/links/0d0a3d6e-6f8b-4bd2-9a3f-0c4b2d1e5f60"
        )
      ).status
    ).toBe(404)
  })
})

describe("sharing several links", () => {
  test("starts an import of them", async () => {
    const res = await kyle.post("/api/share", {
      text: "https://example.com/rice\nhttps://example.com/soup",
    })
    expect(res.status).toBe(202)
    const shared = await res.json()
    expect(shared).toMatchObject({
      outcome: "importing",
      message: "Adding 2 recipes to Merran.",
      recipe: null,
      importId: expect.any(String),
      url: `${TEST_ORIGIN}/recipes/import/${shared.importId}`,
    })
    await jobs.drain()
    expect(await status(shared.importId)).toMatchObject({
      added: 1,
      already: 1,
    })
  })
})

describe("with an API key", () => {
  const withKey = async (
    key: string,
    path: string,
    body?: unknown
  ): Promise<TestResponse> =>
    app.request(`${TEST_ORIGIN}${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        authorization: `Bearer ${key}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })

  test("imports need the imports permission", async () => {
    const make = async (permissions: Record<string, string>) =>
      (
        await (
          await kyle.post("/api/auth/api-keys", {
            name: "Script",
            permissions,
            expiresInDays: 30,
          })
        ).json()
      ).key as string
    const importer = await make({ imports: "write" })
    const reader = await make({ recipes: "write" })
    const body = { urls: ["https://example.com/soup"] }

    expect(
      (await withKey(reader, "/api/recipes/import/links", body)).status
    ).toBe(403)
    const res = await withKey(importer, "/api/recipes/import/links", body)
    expect(res.status).toBe(202)
    const { id } = await res.json()
    expect(
      (await withKey(importer, `/api/recipes/import/links/${id}`)).status
    ).toBe(200)
    await jobs.drain()
  })
})

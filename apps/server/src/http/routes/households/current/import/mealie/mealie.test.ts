import sharp from "sharp"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { AppError } from "../../../../../../core/errors.ts"
import { Job } from "../../../../../../database/entities/index.ts"
import type { Database } from "../../../../../../database/orm.ts"
import type { Fetcher } from "../../../../../../services/fetch/public-fetch.ts"
import type { JobRunner } from "../../../../../../services/jobs/runner.ts"
import {
  account,
  createTestApp,
  inviteToken,
  join,
  setUpServer,
  TestClient,
} from "../../../../../../test/app.ts"

// A Mealie on the home network, answering as Mealie 3 does.

const MEALIE = "http://192.168.1.20:9000"
const TOKEN = "a-mealie-api-token"
const KYLE = "11111111-2222-3333-4444-555555555555"

const summaries = [
  {
    id: "945c1294-d8a8-4f91-a091-14854680dc6e",
    slug: "tomato-soup",
    name: "Tomato Soup",
  },
  {
    id: "a45c1294-d8a8-4f91-a091-14854680dc6f",
    slug: "broken-pie",
    name: "Broken Pie",
  },
  {
    id: "b45c1294-d8a8-4f91-a091-14854680dc70",
    slug: "soda-bread",
    name: "Soda Bread",
  },
]

const recipes: Record<string, object> = {
  "tomato-soup": {
    ...summaries[0],
    userId: KYLE,
    recipeServings: 4,
    performTime: "30 minutes",
    orgURL: "https://example.com/soup",
    rating: 4,
    lastMade: "2024-03-01T12:00:00Z",
    tags: [{ name: "Soup" }],
    recipeIngredient: [
      {
        title: "Base",
        quantity: 2,
        unit: {
          name: "tablespoon",
          abbreviation: "tbsp",
          useAbbreviation: true,
        },
        food: { name: "butter" },
        note: "",
        display: "2 tbsp butter",
      },
      { quantity: 1, note: "1 onion", display: "1 1 onion" },
    ],
    recipeInstructions: [{ title: "", text: "Cook it all." }],
    comments: [],
  },
  // A Mealie that no longer says when it was last made, on the recipe.
  "soda-bread": {
    ...summaries[2],
    recipeYield: "1 loaf",
    recipeIngredient: [{ note: "500 g flour" }],
    recipeInstructions: [{ text: "Bake." }],
  },
}

let photo: Buffer
let close: () => Promise<void>
let database: Database
let jobs: JobRunner
let kyle: TestClient
let jamie: TestClient

const answer = (url: string, status: number, body: unknown) => ({
  url,
  status,
  contentType: "application/json",
  body: Buffer.from(JSON.stringify(body)),
})

const fakeMealie: Fetcher = async (url, options = {}) => {
  const address = new URL(url)
  if (address.origin !== MEALIE) {
    throw new AppError(
      "upstream",
      "site_unreachable",
      "Couldn't reach that site."
    )
  }
  // Only ever on purpose, to the address given.
  if (!options.homeNetwork) throw new Error("Not on the home network")
  const path = address.pathname
  if (path === "/api/app/about") return answer(url, 200, { version: "v3.28.0" })
  if (options.headers?.authorization !== `Bearer ${TOKEN}`) {
    return answer(url, 401, { detail: "Not authenticated" })
  }
  if (path === "/api/recipes") {
    const page = Number(address.searchParams.get("page"))
    const perPage = Number(address.searchParams.get("perPage"))
    return answer(url, 200, {
      page,
      per_page: perPage,
      total: summaries.length,
      total_pages: Math.ceil(summaries.length / perPage),
      items: summaries.slice((page - 1) * perPage, page * perPage),
    })
  }
  const slug = path.match(/^\/api\/recipes\/([^/]+)$/)?.[1]
  if (slug && slug !== "timeline") {
    const recipe = recipes[slug]
    return recipe ? answer(url, 200, recipe) : answer(url, 500, {})
  }
  if (path === "/api/recipes/timeline/events") {
    const filter = address.searchParams.get("queryFilter")
    return answer(url, 200, {
      items:
        filter === 'recipe.slug="tomato-soup"'
          ? [
              {
                eventType: "comment",
                eventMessage: "Needed more salt.",
                userId: KYLE,
                timestamp: "2024-03-01T12:00:00Z",
              },
              { eventType: "system", subject: "Recipe created" },
            ]
          : [],
    })
  }
  if (path === "/api/households/self/recipes/soda-bread") {
    return answer(url, 200, { lastMade: "2024-02-01T00:00:00Z" })
  }
  if (path === "/api/admin/users") return answer(url, 403, {})
  if (path === "/api/users/self") {
    return answer(url, 200, { id: KYLE, email: "kyle@example.com" })
  }
  if (path === `/api/media/recipes/${summaries[0]!.id}/images/original.webp`) {
    return { url, status: 200, contentType: "image/webp", body: photo }
  }
  return answer(url, 404, {})
}

const connection = { url: MEALIE, token: TOKEN }

beforeAll(async () => {
  photo = await sharp({
    create: { width: 900, height: 600, channels: 3, background: "#c63" },
  })
    .webp()
    .toBuffer()
  const test = await createTestApp({ fetcher: fakeMealie })
  ;({ close, database, jobs } = test)
  kyle = await setUpServer(test.app, test.setupCode)
  jamie = await join(
    test.app,
    await inviteToken(kyle, "admin"),
    account("jamie", "Jamie")
  )
})

afterAll(() => close())

describe("connecting to Mealie", () => {
  test("says which Mealie it is and what's there", async () => {
    const res = await kyle.post(
      "/api/households/current/import/mealie/check",
      connection
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      version: "v3.28.0",
      recipes: 3,
      alreadyHere: 0,
    })
  })

  test("says when the token or address is wrong", async () => {
    const wrongToken = await kyle.post(
      "/api/households/current/import/mealie/check",
      { ...connection, token: "not-the-right-token" }
    )
    expect(wrongToken.status).toBe(400)
    expect((await wrongToken.json()).error).toMatchObject({
      code: "mealie_token",
      fields: { token: expect.any(String) },
    })

    const wrongAddress = await kyle.post(
      "/api/households/current/import/mealie/check",
      { ...connection, url: "http://192.168.1.21:9000" }
    )
    expect(wrongAddress.status).toBe(502)
    expect((await wrongAddress.json()).error).toMatchObject({
      code: "mealie_unreachable",
      fields: { url: expect.any(String) },
    })
  })

  test("is for the server admin only", async () => {
    // Jamie is the household's admin, not the server's.
    for (const path of ["mealie/check", "mealie"]) {
      const res = await jamie.post(
        `/api/households/current/import/${path}`,
        connection
      )
      expect(res.status).toBe(403)
    }
  })
})

describe("importing from Mealie", () => {
  test("brings every recipe in, and says which didn't come", async () => {
    const res = await kyle.post(
      "/api/households/current/import/mealie",
      connection
    )
    expect(res.status).toBe(202)
    const { id } = await res.json()
    await jobs.drain()

    const job = await (
      await kyle.get(`/api/households/current/jobs/${id}`)
    ).json()
    expect(job).toMatchObject({
      status: "done",
      result: {
        recipes: 2,
        photos: 1,
        skipped: 0,
        failed: 1,
        failures: [
          { name: "Broken Pie", error: "Mealie answered with an error (500)." },
        ],
      },
    })
    // The token is forgotten once it's finished.
    const stored = await database.em.fork().findOneOrFail(Job, { id })
    expect(stored.payload).toMatchObject({ url: MEALIE, token: null })

    const soup = await (await kyle.get("/api/recipes/tomato-soup")).json()
    expect(soup).toMatchObject({
      origin: "mealie",
      servings: 4,
      cookMinutes: 30,
      rating: 4,
      sourceUrl: "https://example.com/soup",
      lastMadeAt: "2024-03-01T12:00:00.000Z",
      tags: ["Soup"],
      ingredients: [
        { section: "Base", text: "2 tbsp butter" },
        { section: "Base", text: "1 onion" },
      ],
    })
    expect(soup.photo).not.toBeNull()
    expect(
      await (await kyle.get("/api/recipes/tomato-soup/cook-notes")).json()
    ).toMatchObject([{ note: "Needed more salt.", by: "Kyle" }])

    const bread = await (await kyle.get("/api/recipes/soda-bread")).json()
    expect(bread).toMatchObject({
      lastMadeAt: "2024-02-01T00:00:00.000Z",
      photo: null,
    })
  })

  test("again, skips what came in before", async () => {
    const check = await kyle.post(
      "/api/households/current/import/mealie/check",
      connection
    )
    expect((await check.json()).alreadyHere).toBe(2)

    const res = await kyle.post(
      "/api/households/current/import/mealie",
      connection
    )
    await jobs.drain()
    const job = await (
      await kyle.get(`/api/households/current/jobs/${(await res.json()).id}`)
    ).json()
    expect(job.result).toMatchObject({ recipes: 0, skipped: 2, failed: 1 })
  })
})

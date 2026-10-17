import sharp from "sharp"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import yauzl from "yauzl"
import { RecipeIngredient } from "../../../../../database/entities/index.ts"
import { HOUSEHOLD_FILTER } from "../../../../../database/scope.ts"
import type { JobRunner } from "../../../../../services/jobs/runner.ts"
import {
  account,
  createTestApp,
  inviteToken,
  join,
  setUpServer,
  TestClient,
} from "../../../../../test/app.ts"

// Two servers: a household exported from the first is imported into the
// second, as if moving it.
type Server = Awaited<ReturnType<typeof createTestApp>>
let first: Server
let second: Server
let kyle: TestClient
let jamie: TestClient
let kyleThere: TestClient
let exported: Uint8Array
const ids: Record<string, string> = {}

const photo = () =>
  sharp({
    create: { width: 900, height: 600, channels: 3, background: "#c63" },
  })
    .png()
    .toBuffer()

async function importInto(
  client: TestClient,
  jobs: JobRunner,
  zip: Uint8Array
) {
  const res = await client.upload(
    "/api/households/current/import",
    zip,
    "application/zip",
    "POST"
  )
  expect(res.status).toBe(202)
  const job = await res.json()
  await jobs.drain()
  return (await client.get(`/api/households/current/jobs/${job.id}`)).json()
}

beforeAll(async () => {
  first = await createTestApp()
  second = await createTestApp()
  kyle = await setUpServer(first.app, first.setupCode)
  jamie = await join(
    first.app,
    await inviteToken(kyle),
    account("jamie", "Jamie")
  )
  // The same person, on the new server.
  kyleThere = await setUpServer(second.app, second.setupCode)

  const soup = await (
    await kyle.post("/api/recipes", {
      name: "Tomato Soup",
      servings: 4,
      prepMinutes: 10,
      tags: ["Soup", "Dinner"],
      ingredients: ["# For the soup", "2 tbsp butter", "1 onion"],
      steps: ["Melt the butter.", "Add the onion."],
      rating: 4,
    })
  ).json()
  ids.soup = soup.id
  await kyle.upload(`/api/recipes/${soup.id}/photo`, await photo(), "image/png")
  // An edit, so it has a version; and made, with a note, corrected labels.
  await kyle.request("PUT", "/api/recipes/tomato-soup", {
    name: "Tomato Soup",
    servings: 4,
    prepMinutes: 10,
    tags: ["Soup", "Dinner"],
    ingredients: ["# For the soup", "3 tbsp butter", "1 onion"],
    steps: ["Melt the butter.", "Add the onion."],
    rating: 4,
  })
  await kyle.post("/api/recipes/tomato-soup/made")
  await kyle.post("/api/recipes/tomato-soup/cook-notes", {
    rating: 5,
    note: "More salt.",
  })
  await kyle.request("PUT", "/api/recipes/tomato-soup/diets", {
    overrides: { "gluten-free": false },
  })
  // As tidy up would mark it.
  await first.database.em
    .fork()
    .nativeUpdate(
      RecipeIngredient,
      { rawText: "1 onion" },
      { mark: "optional" },
      { filters: { [HOUSEHOLD_FILTER]: false } }
    )

  const sauce = await (
    await kyle.post("/api/recipes", { name: "Pesto", tags: ["Sauce"] })
  ).json()
  ids.sauce = sauce.id
  await kyle.post("/api/recipes/tomato-soup/pairings", {
    recipes: [sauce.id],
    tag: "Sauce",
  })
  // Deleted ones stay behind.
  const gone = await (await kyle.post("/api/recipes", { name: "Gone" })).json()
  await kyle.delete(`/api/recipes/${gone.id}`)
})

afterAll(async () => {
  await first.close()
  await second.close()
})

describe("exporting a household", () => {
  test("gives a zip of its details, recipes and photos", async () => {
    const res = await kyle.get("/api/households/current/export")
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("application/zip")
    expect(res.headers.get("content-disposition")).toMatch(
      /attachment; filename="merran-home-[0-9a-f]+-\d{4}-\d\d-\d\d\.zip"/
    )
    exported = new Uint8Array(await res.arrayBuffer())

    const zip = await yauzl.fromBufferPromise(Buffer.from(exported), {
      lazyEntries: true,
    })
    const names: string[] = []
    for await (const entry of zip.eachEntry()) names.push(entry.fileName)
    expect(names).toEqual([
      "merran-export.json",
      "household.json",
      "recipes.json",
      `photos/${ids.soup}.webp`,
    ])
  })

  test("is for the household's admins", async () => {
    expect((await jamie.get("/api/households/current/export")).status).toBe(403)
  })
})

describe("importing an export", () => {
  test("brings everything in, as it was", async () => {
    const job = await importInto(kyleThere, second.jobs, exported)
    expect(job).toMatchObject({
      status: "done",
      result: { recipes: 2, photos: 1, skipped: 0 },
      progress: { done: 2, total: 2 },
    })

    const soup = await (await kyleThere.get("/api/recipes/tomato-soup")).json()
    expect(soup).toMatchObject({
      id: ids.soup,
      rating: 5,
      tags: ["Dinner", "Soup"],
      lastMadeAt: expect.any(String),
      dietOverrides: { "gluten-free": false },
    })
    expect(soup.diets).not.toContain("gluten-free")
    expect(
      soup.ingredients.map((line: { section: string; text: string }) => [
        line.section,
        line.text,
      ])
    ).toEqual([
      ["For the soup", "3 tbsp butter"],
      ["For the soup", "1 onion"],
    ])
    expect(soup.ingredients.map((line: { mark: string }) => line.mark)).toEqual(
      [null, "optional"]
    )
    expect((await kyleThere.get(soup.photo.full)).status).toBe(200)

    const versions = await (
      await kyleThere.get("/api/recipes/tomato-soup/versions")
    ).json()
    expect(versions).toHaveLength(1)
    const notes = await (
      await kyleThere.get("/api/recipes/tomato-soup/cook-notes")
    ).json()
    expect(notes).toMatchObject([{ note: "More salt.", by: "Kyle" }])
    const pairings = await (
      await kyleThere.get("/api/recipes/tomato-soup/pairings")
    ).json()
    expect(pairings.pairings).toMatchObject([
      { kind: "recipe", recipe: { name: "Pesto" } },
      { kind: "tag", tag: "Sauce" },
    ])
    const deleted = await (await kyleThere.get("/api/recipes/deleted")).json()
    expect(deleted).toEqual([])
  })

  test("skips what's already here, imported a second time", async () => {
    const job = await importInto(kyleThere, second.jobs, exported)
    expect(job.result).toEqual({ recipes: 0, photos: 0, skipped: 2 })
    const pairings = await (
      await kyleThere.get("/api/recipes/tomato-soup/pairings")
    ).json()
    expect(pairings.pairings).toHaveLength(2)
  })

  test("as a new household, with new ids where another has them", async () => {
    const res = await kyle.upload(
      "/api/households/import",
      exported,
      "application/zip",
      "POST"
    )
    expect(res.status).toBe(202)
    const { household, job } = await res.json()
    expect(household).toMatchObject({ name: "Home", role: "owner" })
    await first.jobs.drain()

    // The new household is the one in use now.
    const done = await (
      await kyle.get(`/api/households/current/jobs/${job.id}`)
    ).json()
    expect(done.result).toEqual({ recipes: 2, photos: 1, skipped: 0 })
    const soup = await (await kyle.get("/api/recipes/tomato-soup")).json()
    expect(soup.id).not.toBe(ids.soup)
    const pairings = await (
      await kyle.get("/api/recipes/tomato-soup/pairings")
    ).json()
    expect(pairings.options.map((o: { name: string }) => o.name)).toEqual([
      "Pesto",
    ])
    expect((await jamie.post("/api/households/import")).status).toBe(403)
  })

  test("says when a file isn't an export", async () => {
    const upload = (body: Uint8Array) =>
      kyleThere.upload(
        "/api/households/current/import",
        body,
        "application/zip",
        "POST"
      )
    const notZip = await upload(new TextEncoder().encode("hello"))
    expect(notZip.status).toBe(400)
    expect((await notZip.json()).error.code).toBe("not_a_merran_export")
    expect((await upload(new Uint8Array())).status).toBe(400)
  })
})

describe("your own data", () => {
  test("comes as a file of your account, households, notes and keys", async () => {
    const res = await kyle.get("/api/auth/me/export")
    expect(res.headers.get("content-disposition")).toMatch(
      /attachment; filename="merran-my-data-/
    )
    const data = await res.json()
    expect(data).toMatchObject({
      format: "merran.person",
      account: { name: "Kyle", email: "kyle@example.com" },
    })
    // The note, and its copy in the household imported above.
    expect(data.cookingNotes).toMatchObject([
      { recipe: "Tomato Soup", note: "More salt." },
      { recipe: "Tomato Soup", note: "More salt." },
    ])
    expect(data.households.map((h: { name: string }) => h.name)).toEqual([
      "Home",
      "Home",
    ])
  })
})

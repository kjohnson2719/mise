import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import sharp from "sharp"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../../../app.ts"
import {
  createTestApp,
  setUpServer,
  TEST_ORIGIN,
  TestClient,
} from "../../../../../test/app.ts"

let app: App
let close: () => Promise<void>
let filesDir: string
let kyle: TestClient
let householdId: string

beforeAll(async () => {
  const test = await createTestApp()
  ;({ app, close, filesDir } = test)
  kyle = await setUpServer(app, test.setupCode)
  householdId = (await (await kyle.get("/api/households/current")).json()).id
})

afterAll(() => close())

const photoOf = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: "#3a6" } })
    .png()
    .toBuffer()

/** The photos kept for the household, by id. */
const storedPhotos = () => {
  const folder = join(filesDir, "photos", householdId)
  return existsSync(folder) ? readdirSync(folder) : []
}

async function addRecipe(name: string) {
  return (await (await kyle.post("/api/recipes", { name })).json()) as {
    id: string
    slug: string
  }
}

describe("a recipe's photo", () => {
  test("is kept in two sizes, and shown from its links", async () => {
    const soup = await addRecipe("Soup")
    const res = await kyle.upload(
      `/api/recipes/${soup.slug}/photo`,
      await photoOf(3000, 2000),
      "image/png"
    )
    const recipe = await res.json()

    expect(res.status).toBe(200)
    expect(recipe.photo).toEqual({
      full: expect.stringMatching(/\/photo\?size=full&v=\w+$/),
      card: expect.stringMatching(/\/photo\?size=card&v=\w+$/),
    })
    const full = await kyle.get(recipe.photo.full)
    const size = await sharp(Buffer.from(await full.arrayBuffer())).metadata()
    expect([size.format, size.width, size.height]).toEqual(["webp", 1600, 1067])

    // The same summary is in the list, for cards.
    const list = await (await kyle.get("/api/recipes")).json()
    expect(list.recipes[0].photo).toEqual(recipe.photo)
  })

  test("is replaced, and the old one deleted", async () => {
    const before = storedPhotos()
    const recipe = await (
      await kyle.upload(
        "/api/recipes/soup/photo",
        await photoOf(900, 900),
        "image/png"
      )
    ).json()

    expect(storedPhotos()).toHaveLength(before.length)
    expect(storedPhotos()).not.toEqual(before)
    // An old link still answers, but with the photo there now, and not for keeps.
    const old = await kyle.get(
      `/api/recipes/soup/photo?size=card&v=${before[0]}`
    )
    expect(old.headers.get("cache-control")).toContain("no-cache")
    expect(recipe.photo.card).toContain(storedPhotos()[0])
  })

  test("must be a photo, and not too big", async () => {
    const notPhoto = await kyle.upload(
      "/api/recipes/soup/photo",
      new TextEncoder().encode("not a photo"),
      "image/png"
    )
    expect(notPhoto.status).toBe(400)
    expect((await notPhoto.json()).error.code).toBe("not_an_image")

    const huge = await kyle.upload(
      "/api/recipes/soup/photo",
      new Uint8Array(15_000_001),
      "image/png"
    )
    expect(huge.status).toBe(413)
  })

  test("can be taken away", async () => {
    const res = await kyle.delete("/api/recipes/soup/photo")
    expect((await res.json()).photo).toBeNull()
    expect(storedPhotos()).toEqual([])
    expect((await kyle.get("/api/recipes/soup/photo")).status).toBe(404)
  })

  test("goes when its recipe is deleted for good", async () => {
    const stew = await addRecipe("Stew")
    await kyle.upload(
      "/api/recipes/stew/photo",
      await photoOf(800, 600),
      "image/png"
    )
    expect(storedPhotos()).toHaveLength(1)

    await kyle.delete("/api/recipes/stew")
    expect(storedPhotos()).toHaveLength(1)
    await kyle.delete(`/api/recipes/deleted/${stew.id}`)
    expect(storedPhotos()).toEqual([])
  })

  test("can be seen with a key that reads recipes, and only changed with one that writes", async () => {
    await kyle.upload(
      "/api/recipes/soup/photo",
      await photoOf(800, 600),
      "image/png"
    )
    const key = (
      await (
        await kyle.post("/api/auth/api-keys", {
          name: "Photo frame",
          permissions: { recipes: "read" },
        })
      ).json()
    ).key as string
    const withKey = (method: string) =>
      app.request(`${TEST_ORIGIN}/api/recipes/soup/photo`, {
        method,
        headers: { authorization: `Bearer ${key}` },
      })

    expect((await withKey("GET")).status).toBe(200)
    expect((await withKey("DELETE")).status).toBe(403)
  })
})

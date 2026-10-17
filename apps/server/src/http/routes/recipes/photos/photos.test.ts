import sharp from "sharp"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../../app.ts"
import type { MediaMakers } from "../../../../services/ai/media.ts"
import type { AiTarget } from "../../../../services/ai/providers.ts"
import type { JobRunner } from "../../../../services/jobs/runner.ts"
import { fakeAiFetcher, GOOD_KEYS, mockAiModels } from "../../../../test/ai.ts"
import { createTestApp, setUpServer, TestClient } from "../../../../test/app.ts"

/** What AI was asked to picture, and with which key and model. */
const asked: { target: AiTarget; prompt: string }[] = []
let picture: Buffer

const media: MediaMakers = {
  image: async (target, prompt) => {
    asked.push({ target, prompt })
    return picture
  },
  speech: () => Promise.reject(new Error("Not in these tests.")),
}

let app: App
let close: () => Promise<void>
let jobs: JobRunner
let kyle: TestClient

beforeAll(async () => {
  picture = await sharp({
    create: { width: 1536, height: 1024, channels: 3, background: "#b85" },
  })
    .png()
    .toBuffer()
  const test = await createTestApp({
    fetcher: fakeAiFetcher(),
    ai: mockAiModels(),
    media,
  })
  ;({ app, close, jobs } = test)
  kyle = await setUpServer(app, test.setupCode)
  // The server's OpenAI key, which covers the server admin's own household.
  const key = await kyle.post("/api/settings/server/ai/keys", {
    provider: "openai",
    key: GOOD_KEYS.openai,
  })
  expect(key.status, await key.clone().text()).toBe(201)
  // Off until the server admin turns them on.
  const on = await kyle.patch("/api/settings/server", {
    "photos.enabled": true,
  })
  expect(on.status, await on.clone().text()).toBe(200)
})

afterAll(() => close())

const addRecipe = async (name: string) => {
  const res = await kyle.post("/api/recipes", {
    name,
    description: "Bright and quick.",
    ingredients: [
      "4 chicken thighs",
      "2 lemons",
      "1 tsp salt",
      "2 tbsp olive oil",
    ],
    steps: [
      "Roast the chicken.",
      "Squeeze the lemons over and serve with parsley.",
    ],
  })
  expect(res.status, await res.clone().text()).toBe(201)
  return (await res.json()) as { slug: string }
}

describe("AI photos", () => {
  test("a recipe added without one gets one by itself, in the house style", async () => {
    const { slug } = await addRecipe("Lemon Chicken")
    await jobs.drain()

    const recipe = await (await kyle.get(`/api/recipes/${slug}`)).json()
    expect(recipe.photoByAi).toBe(true)
    expect(recipe.photo).not.toBeNull()
    expect((await kyle.get(recipe.photo.card)).status).toBe(200)

    const [made] = asked
    expect(made!.target).toMatchObject({
      provider: "openai",
      model: "gpt-image-1-mini",
    })
    expect(made!.prompt).toContain("A photograph of Lemon Chicken")
    expect(made!.prompt).toContain("Carrara marble")
    expect(made!.prompt).toContain("serve with parsley")
    // Salt and oil don't change how it looks.
    expect(made!.prompt).toMatch(/Made with: chicken thigh(s)?, lemons?\./)
  })

  test("makes another, in the household's style", async () => {
    const saved = await kyle.patch("/api/settings/household", {
      "photos.style": "rustic",
    })
    expect(saved.status, await saved.clone().text()).toBe(200)
    const before = await (await kyle.get("/api/recipes/lemon-chicken")).json()

    const res = await kyle.post("/api/recipes/lemon-chicken/photo/make")
    expect(res.status, await res.clone().text()).toBe(200)
    const after = await res.json()
    expect(after.photoByAi).toBe(true)
    expect(after.photo.card).not.toBe(before.photo.card)
    expect(asked.at(-1)!.prompt).toContain("weathered oak table")
  })

  test("never replaces a real photo", async () => {
    const real = await sharp({
      create: { width: 900, height: 900, channels: 3, background: "#4a6" },
    })
      .png()
      .toBuffer()
    await kyle.upload("/api/recipes/lemon-chicken/photo", real, "image/png")
    const res = await kyle.post("/api/recipes/lemon-chicken/photo/make")
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe("has_photo")
  })

  test("makes them for the whole library, when asked", async () => {
    await kyle.patch("/api/settings/server", { "photos.auto": false })
    await addRecipe("Garlic Rice")
    await addRecipe("Tomato Soup")
    await jobs.drain()

    const library = await (await kyle.get("/api/recipes/photos")).json()
    expect(library).toMatchObject({
      missing: 2,
      ready: true,
      why: null,
      style: "rustic",
      run: null,
    })

    const started = await kyle.post("/api/recipes/photos")
    expect(started.status).toBe(202)
    await jobs.drain()
    const done = await (await kyle.get("/api/recipes/photos")).json()
    expect(done.missing).toBe(0)
    expect(done.run).toMatchObject({ status: "done", made: 2, failed: 0 })

    const again = await kyle.post("/api/recipes/photos")
    expect(again.status).toBe(400)
  })

  test("are made only when the server has them on", async () => {
    await kyle.patch("/api/settings/server", { "photos.enabled": false })
    const { slug } = await addRecipe("Pea Soup")
    const res = await kyle.post(`/api/recipes/${slug}/photo/make`)
    expect(res.status).toBe(422)
    expect((await res.json()).error.code).toBe("photos_off")
    const library = await (await kyle.get("/api/recipes/photos")).json()
    expect(library).toMatchObject({ ready: false, why: "off" })
    await kyle.patch("/api/settings/server", { "photos.enabled": true })
  })
})

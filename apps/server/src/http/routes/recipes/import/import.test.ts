import sharp from "sharp"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../../app.ts"
import { AppError } from "../../../../core/errors.ts"
import type { Fetcher } from "../../../../services/fetch/public-fetch.ts"
import { createTestApp, setUpServer, TestClient } from "../../../../test/app.ts"

const SOUP_PAGE = `<!doctype html><html><head>
<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Recipe",
  name: "Tomato Soup",
  description: "Smooth and quick.",
  image: "https://cooking.example/soup.jpg",
  recipeYield: "4 servings",
  prepTime: "PT10M",
  cookTime: "PT25M",
  recipeCategory: "soup, Dinner",
  recipeIngredient: ["2 tbsp olive oil", "1 onion, diced"],
  recipeInstructions: [
    { "@type": "HowToStep", text: "Soften the onion in the oil." },
    { "@type": "HowToStep", text: "Add the tomatoes and simmer." },
  ],
})}</script></head><body>Soup</body></html>`

/** Pages and photos the tests' internet has, by link. */
const web = new Map<
  string,
  { body: Buffer; contentType: string; finalUrl?: string }
>()

/** Fetches from the tests' little internet, which never leaves the machine. */
const fetcher: Fetcher = async (url) => {
  const page = web.get(url)
  if (!page) {
    throw new AppError(
      "upstream",
      "site_unreachable",
      "Couldn't reach that site."
    )
  }
  return {
    url: page.finalUrl ?? url,
    status: 200,
    contentType: page.contentType,
    body: page.body,
  }
}

let app: App
let close: () => Promise<void>
let kyle: TestClient

beforeAll(async () => {
  const photo = await sharp({
    create: { width: 1200, height: 800, channels: 3, background: "#c33" },
  })
    .jpeg()
    .toBuffer()
  const html = { contentType: "text/html; charset=utf-8" }
  web.set("https://cooking.example/soup", {
    ...html,
    body: Buffer.from(SOUP_PAGE),
  })
  web.set("https://cooking.example/soup.jpg", {
    contentType: "image/jpeg",
    body: photo,
  })
  web.set("https://cooking.example/old-soup", {
    ...html,
    body: Buffer.from(SOUP_PAGE),
    finalUrl: "https://cooking.example/soup",
  })
  web.set("https://cooking.example/tips", {
    ...html,
    body: Buffer.from("<html><body>Ten kitchen tips</body></html>"),
  })
  web.set("https://cooking.example/menu.pdf", {
    contentType: "application/pdf",
    body: Buffer.from("%PDF"),
  })

  const test = await createTestApp({ fetcher })
  ;({ app, close } = test)
  kyle = await setUpServer(app, test.setupCode)
})

afterAll(() => close())

const importLink = (url: string, force?: boolean) =>
  kyle.post("/api/recipes/import", { url, ...(force ? { force } : {}) })

describe("importing a link", () => {
  test("adds the recipe the page describes, with its photo", async () => {
    const res = await importLink("https://cooking.example/soup")
    const { recipe, duplicate } = await res.json()

    expect(res.status).toBe(201)
    expect(duplicate).toBe(false)
    expect(recipe).toMatchObject({
      slug: "tomato-soup",
      origin: "link",
      sourceUrl: "https://cooking.example/soup",
      servings: 4,
      totalMinutes: 35,
      tags: ["Dinner", "Soup"],
    })
    expect(
      recipe.ingredients.map((line: { food: string }) => line.food)
    ).toEqual(["olive oil", "onion"])

    const photo = await kyle.get(recipe.photo.card)
    expect(photo.status).toBe(200)
    expect(photo.headers.get("content-type")).toBe("image/webp")
    expect(photo.headers.get("cache-control")).toContain("immutable")
    expect(
      (await sharp(Buffer.from(await photo.arrayBuffer())).metadata()).width
    ).toBe(800)
  })

  test("gives back the recipe already imported from a link", async () => {
    const again = await importLink(
      "https://cooking.example/soup?utm_source=newsletter#comments"
    )
    expect(again.status).toBe(200)
    expect((await again.json()).duplicate).toBe(true)

    // Even when the link it was given redirects there.
    const moved = await importLink("https://cooking.example/old-soup")
    expect((await moved.json()).duplicate).toBe(true)
  })

  test("imports again when asked to", async () => {
    const res = await importLink("https://cooking.example/soup", true)
    expect(res.status).toBe(201)
    expect((await res.json()).recipe.slug).toBe("tomato-soup-2")
  })

  test("says why it couldn't", async () => {
    const cases = [
      ["https://cooking.example/tips", 422, "no_recipe_data"],
      ["https://cooking.example/menu.pdf", 422, "not_a_page"],
      // A video, without yt-dlp and ffmpeg here.
      ["https://www.youtube.com/watch?v=abc", 422, "video_tools_missing"],
      ["https://cooking.example/gone", 502, "site_unreachable"],
      ["http://192.168.1.20/recipes/soup", 400, "private_address"],
      ["soup", 400, "not_a_link"],
    ] as const
    for (const [url, status, code] of cases) {
      const res = await importLink(url)
      expect(res.status, url).toBe(status)
      expect((await res.json()).error.code, url).toBe(code)
    }
  })

  test("needs a signed-in person or a key that may write recipes", async () => {
    const res = await new TestClient(app).post("/api/recipes/import", {
      url: "https://cooking.example/soup",
    })
    expect(res.status).toBe(401)
  })
})

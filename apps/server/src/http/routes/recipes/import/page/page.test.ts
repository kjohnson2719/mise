import sharp from "sharp"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../../../app.ts"
import { AppError } from "../../../../../core/errors.ts"
import type { Fetcher } from "../../../../../services/fetch/public-fetch.ts"
import {
  createTestApp,
  setUpServer,
  TEST_ORIGIN,
  type TestResponse,
} from "../../../../../test/app.ts"

const RECIPE = {
  "@context": "https://schema.org",
  "@type": "Recipe",
  name: "Members-Only Lasagne",
  recipeYield: "6",
  recipeIngredient: ["9 lasagne sheets", "500 g beef mince", "400 g passata"],
  recipeInstructions: [{ "@type": "HowToStep", text: "Layer and bake." }],
}

let photo: Buffer
const fetched: string[] = []

// The site itself turns servers away; only its photo can be fetched.
const fetcher: Fetcher = async (url) => {
  fetched.push(url)
  if (url === "https://paywalled.example/lasagne.jpg") {
    return { url, status: 200, contentType: "image/jpeg", body: photo }
  }
  throw new AppError(
    "upstream",
    "site_refused",
    "That site turned Merran away."
  )
}

let app: App
let close: () => Promise<void>
let key: string
let listOnly: string

beforeAll(async () => {
  photo = await sharp({
    create: { width: 1200, height: 900, channels: 3, background: "#a42" },
  })
    .jpeg()
    .toBuffer()
  const test = await createTestApp({ fetcher })
  ;({ app, close } = test)
  const kyle = await setUpServer(app, test.setupCode)
  const made = async (permissions: Record<string, string>) =>
    (
      await (
        await kyle.post("/api/auth/api-keys", {
          name: "Browser extension",
          permissions,
          expiresInDays: null,
        })
      ).json()
    ).key as string
  key = await made({ imports: "write", recipes: "write", list: "write" })
  listOnly = await made({ list: "write" })
})

afterAll(() => close())

/** What the extension sends: the page as the person's browser shows it. */
const sendPage = (page: Record<string, unknown>, withKey = key) =>
  app.request(`${TEST_ORIGIN}/api/recipes/import/page`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${withKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(page),
  }) as Promise<unknown> as Promise<TestResponse>

describe("a page the extension read", () => {
  test("is added from its recipe data, with its photo", async () => {
    const res = await sendPage({
      url: "https://paywalled.example/lasagne?utm_source=email",
      title: "Members-Only Lasagne",
      jsonld: [JSON.stringify(RECIPE)],
      images: ["https://paywalled.example/lasagne.jpg"],
      text: "Members-Only Lasagne. Serves 6.",
    })
    expect(res.status, await res.clone().text()).toBe(201)
    const { recipe, duplicate } = await res.json()
    expect(duplicate).toBe(false)
    expect(recipe).toMatchObject({
      name: "Members-Only Lasagne",
      origin: "link",
      sourceUrl: "https://paywalled.example/lasagne",
      servings: 6,
    })
    expect(recipe.photo).not.toBeNull()
    // Merran's server never opened the page itself.
    expect(fetched).toEqual(["https://paywalled.example/lasagne.jpg"])
  })

  test("gives back the recipe when it's been added before", async () => {
    const res = await sendPage({
      url: "https://paywalled.example/lasagne",
      jsonld: [JSON.stringify(RECIPE)],
    })
    expect(res.status).toBe(200)
    expect((await res.json()).duplicate).toBe(true)
  })

  test("without recipe data, needs AI to read it", async () => {
    const res = await sendPage({
      url: "https://paywalled.example/notes",
      title: "Grandma's notes",
      text: "Mix the flour and butter. Bake until golden. ".repeat(20),
    })
    expect(res.status).toBe(422)
    expect((await res.json()).error.code).toBe("no_recipe_data")
  })

  test("is imported as the video when it's a video's page", async () => {
    const res = await sendPage({
      url: "https://www.youtube.com/watch?v=lemon&t=12",
      title: "Lemon chicken in 40 minutes - YouTube",
      text: "Lemon chicken in 40 minutes. Sam Cooks. 1.2M views.",
    })
    // Not read as a page: it goes to video import, which these tests'
    // server hasn't the tools for.
    expect(res.status).toBe(422)
    expect((await res.json()).error.code).toBe("video_tools_missing")
  })

  test("needs a key that may import", async () => {
    const res = await sendPage(
      {
        url: "https://paywalled.example/other",
        jsonld: [JSON.stringify(RECIPE)],
      },
      listOnly
    )
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe("missing_permission")
  })
})

import sharp from "sharp"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../app.ts"
import { AppError } from "../../../core/errors.ts"
import { RecipeSite, SiteRecipe } from "../../../database/entities/index.ts"
import type { Database } from "../../../database/orm.ts"
import type { Fetcher } from "../../../services/fetch/public-fetch.ts"
import { enqueue } from "../../../services/jobs/jobs.ts"
import type { JobRunner } from "../../../services/jobs/runner.ts"
import { siteData } from "../../../services/sites/data.ts"
import { forgetRobots } from "../../../services/sites/robots.ts"
import { PACE } from "../../../services/sites/shelf.ts"
import { createTestApp, setUpServer, TestClient } from "../../../test/app.ts"

const recipePage = (recipe: Record<string, unknown>) =>
  `<!doctype html><html><head><script type="application/ld+json">${JSON.stringify(
    {
      "@context": "https://schema.org",
      "@type": "Recipe",
      recipeInstructions: [{ "@type": "HowToStep", text: "Cook it." }],
      ...recipe,
    }
  )}</script></head><body></body></html>`

const FEED = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Cooking Example</title>
  <link>https://cooking.example/</link>
  <item><title>Lentil Soup</title><link>https://cooking.example/lentil-soup/</link><pubDate>Wed, 15 Oct 2026 08:00:00 +0000</pubDate></item>
  <item><title>Peanut Noodles</title><link>https://cooking.example/peanut-noodles/?utm_source=rss</link><pubDate>Tue, 14 Oct 2026 08:00:00 +0000</pubDate></item>
  <item><title>Ten Kitchen Tips</title><link>https://cooking.example/kitchen-tips/</link><pubDate>Mon, 13 Oct 2026 08:00:00 +0000</pubDate></item>
  <item><title>Secret Stew</title><link>https://cooking.example/private/secret-stew/</link><pubDate>Sun, 12 Oct 2026 08:00:00 +0000</pubDate></item>
</channel></rss>`

/** The tests' little internet: pages by link, with a status if not 200. */
const web = new Map<
  string,
  { body: Buffer | string; contentType?: string; status?: number }
>()
const asked: string[] = []

const fetcher: Fetcher = async (url, options = {}) => {
  asked.push(url)
  const page = web.get(url)
  const status = page?.status ?? (page ? 200 : 404)
  if (status >= 400 && !options.keepErrors) {
    throw new AppError(
      "upstream",
      status === 403 ? "site_refused" : "site_error",
      "That site answered with an error."
    )
  }
  return {
    url,
    status,
    contentType: page?.contentType ?? "text/html; charset=utf-8",
    body: Buffer.from(page?.body ?? ""),
  }
}

let app: App
let close: () => Promise<void>
let database: Database
let jobs: JobRunner
let kyle: TestClient

beforeAll(async () => {
  PACE.seconds = 0
  forgetRobots()
  web.set("https://cooking.example/", {
    body: `<html><head>
      <link rel="alternate" type="application/rss+xml" title="Comments" href="/comments/feed/">
      <link rel="alternate" type="application/rss+xml" href="/feed/">
    </head><body>Home</body></html>`,
  })
  web.set("https://cooking.example/feed/", {
    body: FEED,
    contentType: "application/rss+xml",
  })
  web.set("https://cooking.example/robots.txt", {
    body: "User-agent: *\nDisallow: /private/\n",
    contentType: "text/plain",
  })
  web.set("https://cooking.example/lentil-soup/", {
    body: recipePage({
      name: "Lentil Soup",
      description: "Thick, warming and cheap.",
      image: "https://cooking.example/lentil-soup.jpg",
      totalTime: "PT40M",
      recipeCategory: "Soup",
      recipeCuisine: "Middle Eastern",
      keywords: "lentils, easy, vegan",
      recipeIngredient: ["1 cup red lentils", "1 onion", "4 cups water"],
    }),
  })
  web.set("https://cooking.example/peanut-noodles/", {
    body: recipePage({
      name: "Peanut Noodles",
      recipeCategory: "Main Course",
      totalTime: "PT20M",
      recipeIngredient: ["200 g noodles", "3 tbsp peanut butter"],
    }),
  })
  web.set("https://cooking.example/kitchen-tips/", {
    body: "<html><body>Ten tips</body></html>",
  })
  web.set("https://cooking.example/private/secret-stew/", {
    body: recipePage({ name: "Secret Stew", recipeIngredient: ["beef"] }),
  })
  web.set("https://cooking.example/lentil-soup.jpg", {
    body: await sharp({
      create: { width: 1200, height: 900, channels: 3, background: "#a63" },
    })
      .jpeg()
      .toBuffer(),
    contentType: "image/jpeg",
  })
  web.set("https://plain.example/", { body: "<html><body>Hi</body></html>" })

  const test = await createTestApp({ fetcher })
  ;({ app, close, database, jobs } = test)
  kyle = await setUpServer(app, test.setupCode)
})

afterAll(async () => {
  PACE.seconds = 3
  await close()
})

type Site = {
  id: string
  name: string
  reading: boolean
  waiting: number
  error: string | null
  recipes: {
    id: string
    name: string
    url: string
    photo: string | null
    minutes: number | null
    description: string | null
    suits: boolean
    inLibrary: { slug: string } | null
  }[]
}

describe("following a site", () => {
  let followed: Site

  test("finds its feed from any page, then reads it in the background", async () => {
    const res = await kyle.post("/api/sites", {
      url: "https://cooking.example/",
    })
    expect(res.status).toBe(201)
    followed = await res.json()
    expect(followed).toMatchObject({
      name: "Cooking Example",
      reading: true,
      recipes: [],
    })

    await jobs.drain()
    const { sites } = await (await kyle.get("/api/sites")).json()
    expect(sites).toHaveLength(1)
    const [site] = sites as Site[]
    expect(site).toMatchObject({ reading: false, waiting: 0, error: null })
    // Not the tips, which aren't a recipe, nor what robots.txt keeps it from.
    expect(site!.recipes.map((recipe) => recipe.name)).toEqual([
      "Lentil Soup",
      "Peanut Noodles",
    ])
    expect(site!.recipes[0]).toMatchObject({
      url: "https://cooking.example/lentil-soup/",
      minutes: 40,
      description: "Thick, warming and cheap.",
      suits: true,
      inLibrary: null,
    })
    // The tracking bit is left off.
    expect(site!.recipes[1]!.url).toBe(
      "https://cooking.example/peanut-noodles/"
    )
    expect(asked).not.toContain("https://cooking.example/private/secret-stew/")
  })

  test("keeps what the shelf learned about each recipe", async () => {
    const em = database.em.fork()
    const soup = await em.findOneOrFail(SiteRecipe, {
      url: "https://cooking.example/lentil-soup/",
    })
    expect(soup).toMatchObject({
      courses: ["soup"],
      siteName: "Cooking Example",
      state: "recipe",
    })
    expect(soup.keywords).toEqual(
      expect.arrayContaining(["soup", "middle eastern", "lentils", "vegan"])
    )
    expect(soup.diets).toEqual(expect.arrayContaining(["vegan", "vegetarian"]))
    const tips = await em.findOneOrFail(SiteRecipe, {
      url: "https://cooking.example/kitchen-tips/",
    })
    expect(tips.state).toBe("not-recipe")
  })

  test("says which recipes don't suit the household", async () => {
    await kyle.put("/api/households/current/tastes", {
      avoid: [{ food: "peanuts", level: "allergy" }],
      diets: [],
      weeknightMinutes: null,
    })
    const { recipes } = await (await kyle.get("/api/sites/recipes")).json()
    expect(
      recipes.map((recipe: Site["recipes"][number]) => [
        recipe.name,
        recipe.suits,
      ])
    ).toEqual([
      ["Lentil Soup", true],
      ["Peanut Noodles", false],
    ])
  })

  test("knows which are in the library", async () => {
    const imported = await kyle.post("/api/recipes/import", {
      url: "https://cooking.example/lentil-soup/",
    })
    expect(imported.status).toBe(201)
    const { recipes } = await (await kyle.get("/api/sites/recipes")).json()
    expect(recipes[0].inLibrary).toMatchObject({ slug: "lentil-soup" })
  })

  test("shows each photo small, through Merran", async () => {
    const { recipes } = await (await kyle.get("/api/sites/recipes")).json()
    const res = await kyle.get(recipes[0].photo)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("image/webp")
    const photo = Buffer.from(await res.arrayBuffer())
    expect((await sharp(photo).metadata()).width).toBe(640)

    // Fetched once: the second time it's the kept copy.
    const fetched = asked.filter((url) =>
      url.endsWith("lentil-soup.jpg")
    ).length
    expect((await kyle.get(recipes[0].photo)).status).toBe(200)
    expect(asked.filter((url) => url.endsWith("lentil-soup.jpg"))).toHaveLength(
      fetched
    )
  })

  test("asks the feed again only for what's new", async () => {
    web.set("https://cooking.example/feed/", {
      body: "",
      status: 304,
    })
    const em = database.em.fork()
    const site = await em.findOneOrFail(RecipeSite, {
      feedUrl: "https://cooking.example/feed/",
    })
    site.nextReadAt = new Date(0)
    await em.flush()
    await enqueue(em, { kind: "sites.read", payload: { siteId: site.id } })
    await jobs.drain()
    const { sites } = await (await kyle.get("/api/sites")).json()
    expect(sites[0]).toMatchObject({ error: null })
    expect(sites[0].recipes).toHaveLength(2)
    web.set("https://cooking.example/feed/", {
      body: FEED,
      contentType: "application/rss+xml",
    })
  })

  test("won't follow a site twice, and stops following it", async () => {
    const again = await kyle.post("/api/sites", {
      url: "https://cooking.example/feed/",
    })
    expect(again.status).toBe(409)

    expect((await kyle.delete(`/api/sites/${followed.id}`)).status).toBe(204)
    const list = await (await kyle.get("/api/sites")).json()
    expect(list.sites).toEqual([])
    expect(
      list.suggestions.map((site: { name: string }) => site.name)
    ).toContain("RecipeTin Eats")
    expect((await kyle.delete(`/api/sites/${followed.id}`)).status).toBe(404)
  })

  test("follows a suggestion as it's listed", async () => {
    const res = await kyle.post("/api/sites", {
      url: "https://www.recipetineats.com/",
    })
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({
      name: "RecipeTin Eats",
      feedUrl: "https://www.recipetineats.com/feed/",
    })
  })

  test("says when a site has no feed", async () => {
    const res = await kyle.post("/api/sites", { url: "https://plain.example/" })
    expect(res.status).toBe(422)
    expect((await res.json()).error.code).toBe("no_feed")
  })
})

describe("the half-hourly read", () => {
  test("adds the suggested sites and classics, and opens the classics", async () => {
    const em = database.em.fork()
    await enqueue(em, { kind: "sites.read" })
    await jobs.drain()

    const english = siteData().get("en")!
    const sites = await em.find(RecipeSite, {
      feedUrl: { $in: english.sites.map((site) => site.feedUrl) },
    })
    expect(sites).toHaveLength(english.sites.length)
    const classics = await em.find(SiteRecipe, { classic: true })
    const listed = new Set(
      english.collections.flatMap((collection) =>
        collection.classics.map((classic) => classic.url)
      )
    )
    expect(classics).toHaveLength(listed.size)
    // None of them answer in these tests, so each is tried again later.
    expect(classics.every((row) => row.openedAt && row.failures === 1)).toBe(
      true
    )
  })
})

describe("starter collections", () => {
  const soups = siteData()
    .get("en")!
    .collections.find((collection) => collection.id === "soups")!

  beforeAll(async () => {
    const em = database.em.fork()
    const row = (name: string, more: Partial<SiteRecipe> = {}) =>
      em.create(SiteRecipe, {
        url: `https://soups.example/${name.toLowerCase().replace(/\W+/g, "-")}`,
        state: "recipe",
        siteName: "Soups Example",
        name,
        courses: ["soup"],
        keywords: [],
        ingredients: ["1 onion", "4 cups stock"],
        diets: [],
        publishedAt: new Date(),
        ...more,
      })
    const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000)
    row("Tomato Soup", { publishedAt: daysAgo(1) })
    row("Corn Chowder", { courses: [], publishedAt: daysAgo(2) })
    row("Peanut Stew", {
      ingredients: ["1 cup peanuts"],
      publishedAt: daysAgo(3),
    })
    // Older than a month: after the classics.
    row("Pea Soup", { publishedAt: daysAgo(60) })
    // A classic that opened: it's listed with the collection.
    const classic = await em.findOneOrFail(SiteRecipe, {
      url: soups.classics[0]!.url,
    })
    Object.assign(classic, {
      state: "recipe",
      name: "French Onion Soup",
      courses: ["soup"],
      ingredients: ["6 onions"],
    })
    await em.flush()
  })

  test("are listed when there are enough that suit the household", async () => {
    const { collections } = await (await kyle.get("/api/collections")).json()
    const listed = collections.find(
      (collection: { id: string }) => collection.id === "soups"
    )
    // Six fit, but the peanut stew doesn't suit them, and the lentil soup
    // from the site followed before is in the library.
    expect(listed).toMatchObject({ title: soups.title, count: 5, toImport: 4 })
    // The rest have too few.
    expect(
      collections.map((collection: { id: string }) => collection.id)
    ).toEqual(["soups"])
  })

  test("show their recipes: new ones, then the classics", async () => {
    const res = await kyle.get("/api/collections/soups")
    expect(res.status).toBe(200)
    const collection = await res.json()
    expect(
      collection.recipes.map((recipe: { name: string }) => recipe.name)
    ).toEqual([
      "Tomato Soup",
      "Corn Chowder",
      "French Onion Soup",
      "Pea Soup",
      // In the library already: last.
      "Lentil Soup",
    ])
    expect(collection.found).toBeNull()
    expect((await kyle.get("/api/collections/nope")).status).toBe(404)
  })

  test("import whole, in the background", async () => {
    const res = await kyle.post("/api/collections/soups/import")
    expect(res.status).toBe(202)
    const started = await res.json()
    expect(started.items).toHaveLength(4)
  })

  test("need AI to find more", async () => {
    const res = await kyle.post("/api/collections/soups/find")
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toMatch(/^ai_/)
  })
})

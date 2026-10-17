import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../app.ts"
import {
  RecipeIngredient,
  RecipeVersion,
} from "../../../database/entities/index.ts"
import type { Database } from "../../../database/orm.ts"
import { ACROSS_HOUSEHOLDS } from "../../../database/scope.ts"
import {
  account,
  createTestApp,
  inviteToken,
  join,
  setUpServer,
  TEST_ORIGIN,
  TestClient,
} from "../../../test/app.ts"

let app: App
let close: () => Promise<void>
let database: Database
let kyle: TestClient
let jamie: TestClient

beforeAll(async () => {
  const test = await createTestApp()
  ;({ app, close, database } = test)
  kyle = await setUpServer(app, test.setupCode)
  jamie = await join(app, await inviteToken(kyle), account("jamie", "Jamie"))
})

afterAll(() => close())

const SOUP = {
  name: "Tomato Soup",
  description: "Smooth and quick.",
  servings: 4,
  prepMinutes: 10,
  cookMinutes: 25,
  tags: ["Soup", "weeknight"],
  ingredients: [
    "2 tbsp olive oil",
    "1 onion, diced",
    "# For serving",
    "1/2 cup heavy cream",
  ],
  steps: ["Soften the onion in the oil.", "Add the tomatoes and simmer."],
}

async function add(client: TestClient, recipe: Record<string, unknown>) {
  const res = await client.post("/api/recipes", recipe)
  if (res.status !== 201) {
    throw new Error(`Adding failed: ${res.status} ${await res.text()}`)
  }
  return res.json()
}

async function list(client: TestClient, query = "") {
  return (await client.get(`/api/recipes${query}`)).json()
}

describe("adding a recipe", () => {
  test("reads its lines into amounts, sections and steps", async () => {
    const soup = await add(kyle, SOUP)

    expect(soup).toMatchObject({
      slug: "tomato-soup",
      name: "Tomato Soup",
      servings: 4,
      totalMinutes: 35,
      origin: "manual",
      tags: ["Soup", "weeknight"],
    })
    expect(soup.ingredients).toEqual([
      expect.objectContaining({
        section: null,
        text: "2 tbsp olive oil",
        quantity: 2,
        unit: "tablespoon",
        food: "olive oil",
      }),
      expect.objectContaining({ food: "onion", note: "diced", unit: null }),
      expect.objectContaining({
        section: "For serving",
        quantity: 0.5,
        unit: "cup",
        food: "heavy cream",
      }),
    ])
    expect(soup.steps.map((step: { text: string }) => step.text)).toEqual(
      SOUP.steps
    )
  })

  test("gives each its own address", async () => {
    expect((await add(kyle, { name: "Tomato Soup" })).slug).toBe(
      "tomato-soup-2"
    )
    expect((await add(kyle, { name: "New" })).slug).toBe("new-2")
  })

  test("needs a name, and says what else is wrong", async () => {
    const res = await kyle.post("/api/recipes", {
      name: " ",
      servings: 0,
      sourceUrl: "not a link",
    })

    expect(res.status).toBe(400)
    expect((await res.json()).error.fields).toEqual({
      name: "Give the recipe a name.",
      servings: "Use a number above 0.",
      sourceUrl: "Use a full link, starting with https://",
    })
  })
})

describe("a recipe", () => {
  test("is found by its slug or its id", async () => {
    const bySlug = await (await jamie.get("/api/recipes/tomato-soup")).json()
    const byId = await (await jamie.get(`/api/recipes/${bySlug.id}`)).json()

    expect(byId).toEqual(bySlug)
    expect((await jamie.get("/api/recipes/no-such-thing")).status).toBe(404)
  })

  test("is changed whole, keeping its slug and a version of how it was", async () => {
    const res = await jamie.request("PUT", "/api/recipes/tomato-soup", {
      ...SOUP,
      name: "Roasted Tomato Soup",
      tags: ["soup"],
      ingredients: ["3 tbsp olive oil", "2 onions"],
    })
    const soup = await res.json()

    expect(res.status).toBe(200)
    expect(soup).toMatchObject({
      slug: "tomato-soup",
      name: "Roasted Tomato Soup",
      tags: ["Soup"],
    })
    expect(soup.ingredients.map((line: { text: string }) => line.text)).toEqual(
      ["3 tbsp olive oil", "2 onions"]
    )
    // The old lines are gone, not left behind.
    expect(
      await database.em
        .fork()
        .count(RecipeIngredient, { recipe: soup.id }, ACROSS_HOUSEHOLDS)
    ).toBe(2)

    const versions = await (
      await jamie.get("/api/recipes/tomato-soup/versions")
    ).json()
    expect(versions).toEqual([
      expect.objectContaining({
        source: "edit",
        name: "Tomato Soup",
        createdBy: "Jamie",
      }),
    ])
  })

  test("can go back to a version, which can be undone too", async () => {
    const [version] = await (
      await kyle.get("/api/recipes/tomato-soup/versions")
    ).json()
    const res = await kyle.post(
      `/api/recipes/tomato-soup/versions/${version.id}/restore`
    )
    const soup = await res.json()

    expect(res.status).toBe(200)
    expect(soup).toMatchObject({
      name: "Tomato Soup",
      tags: ["Soup", "weeknight"],
    })
    expect(
      soup.ingredients.map((line: { section: string | null }) => line.section)
    ).toEqual([null, null, "For serving"])
    const versions = await (
      await kyle.get("/api/recipes/tomato-soup/versions")
    ).json()
    expect(versions.map((v: { source: string }) => v.source)).toEqual([
      "restore",
      "edit",
    ])
  })
})

describe("finding recipes", () => {
  beforeAll(async () => {
    await add(kyle, {
      name: "Lemon Chicken",
      tags: ["weeknight", "Chicken"],
      ingredients: ["4 chicken thighs", "1 lemon"],
      rating: 5,
    })
    await add(kyle, {
      name: "apple pie",
      tags: ["Baking"],
      ingredients: ["6 apples", "1 cup sugar"],
    })
  })

  test("by words in the name, description or ingredients", async () => {
    const names = async (q: string) =>
      (await list(kyle, `?q=${encodeURIComponent(q)}`)).recipes.map(
        (recipe: { name: string }) => recipe.name
      )

    expect(await names("lemon")).toEqual(["Lemon Chicken"])
    expect(await names("SMOOTH")).toEqual(["Tomato Soup"])
    expect(await names("sugar")).toEqual(["apple pie"])
    expect(await names("100%")).toEqual([])
  })

  test("by tags, all of them", async () => {
    const weeknight = await list(kyle, "?tag=Weeknight")
    expect(weeknight.total).toBe(2)

    const both = await list(kyle, "?tag=weeknight&tag=chicken")
    expect(both.recipes.map((r: { name: string }) => r.name)).toEqual([
      "Lemon Chicken",
    ])
    expect((await list(kyle, "?tag=nothing")).total).toBe(0)
  })

  test("sorted, a page at a time", async () => {
    const byRating = await list(kyle, "?sort=rating&limit=1")
    expect(byRating.total).toBe(5)
    expect(byRating.recipes.map((r: { name: string }) => r.name)).toEqual([
      "Lemon Chicken",
    ])

    const second = await list(kyle, "?sort=newest&limit=1&offset=1")
    expect(second.recipes).toHaveLength(1)
    expect(second.recipes[0].name).toBe("Lemon Chicken")
  })

  test("new ones, not made yet, or by when they were last made", async () => {
    await kyle.post("/api/recipes/apple-pie/made")
    await kyle.post("/api/recipes/lemon-chicken/made")
    const names = (found: { recipes: { name: string }[] }) =>
      found.recipes.map((r) => r.name)

    const fresh = await list(kyle, "?new=true")
    expect(fresh.total).toBe(3)
    expect(names(fresh)).not.toContain("apple pie")
    expect(names(await list(kyle, "?new=false"))).toEqual([
      "apple pie",
      "Lemon Chicken",
    ])
    expect(names(await list(kyle, "?sort=made&limit=2"))).toEqual([
      "Lemon Chicken",
      "apple pie",
    ])
  })

  test("only in the household's own recipes", async () => {
    // A second household, which the server admin switches to on starting it.
    await kyle.post("/api/households", { name: "Cabin" })
    expect((await list(kyle)).total).toBe(0)
    expect((await kyle.get("/api/recipes/tomato-soup")).status).toBe(404)
    expect((await list(jamie)).total).toBe(5)

    const [home] = (await (await kyle.get("/api/auth/me")).json()).households
    await kyle.post("/api/auth/organization/set-active", {
      organizationId: home.id,
    })
    expect((await list(kyle)).total).toBe(5)
  })
})

describe("tags", () => {
  async function tags() {
    return (await kyle.get("/api/recipes/tags")).json()
  }
  const tagId = async (name: string) =>
    (await tags()).find((tag: { name: string }) => tag.name === name).id

  test("are listed with how many recipes have each", async () => {
    expect(await tags()).toEqual([
      { id: expect.any(String), name: "Baking", recipes: 1 },
      { id: expect.any(String), name: "Chicken", recipes: 1 },
      { id: expect.any(String), name: "Soup", recipes: 1 },
      { id: expect.any(String), name: "weeknight", recipes: 2 },
    ])
  })

  test("can be renamed, or merged by naming one like another", async () => {
    await kyle.patch(`/api/recipes/tags/${await tagId("weeknight")}`, {
      name: "Weeknight",
    })
    const res = await kyle.patch(
      `/api/recipes/tags/${await tagId("Chicken")}`,
      {
        name: "weeknight",
      }
    )

    expect(res.status).toBe(200)
    expect(
      (await res.json()).map((tag: { name: string; recipes: number }) => [
        tag.name,
        tag.recipes,
      ])
    ).toEqual([
      ["Baking", 1],
      ["Soup", 1],
      ["Weeknight", 2],
    ])
    expect((await list(kyle, "?tag=weeknight")).total).toBe(2)
  })

  test("can be deleted, leaving the recipes", async () => {
    const res = await kyle.delete(`/api/recipes/tags/${await tagId("Baking")}`)

    expect(res.status).toBe(204)
    expect(
      (await (await kyle.get("/api/recipes/apple-pie")).json()).tags
    ).toEqual([])
  })
})

describe("Recently deleted", () => {
  test("holds deleted recipes until they're put back", async () => {
    expect((await kyle.delete("/api/recipes/apple-pie")).status).toBe(204)
    expect((await kyle.get("/api/recipes/apple-pie")).status).toBe(404)
    expect(
      (await list(kyle)).recipes.map((r: { name: string }) => r.name)
    ).not.toContain("apple pie")

    const deleted = await (await kyle.get("/api/recipes/deleted")).json()
    expect(deleted).toEqual([
      expect.objectContaining({
        name: "apple pie",
        deletedAt: expect.any(String),
        goneAt: expect.any(String),
      }),
    ])
    const days =
      (Date.parse(deleted[0].goneAt) - Date.parse(deleted[0].deletedAt)) /
      86_400_000
    expect(days).toBe(30)

    const res = await kyle.post(`/api/recipes/deleted/${deleted[0].id}/restore`)
    expect(res.status).toBe(200)
    expect((await res.json()).slug).toBe("apple-pie")
    expect((await kyle.get("/api/recipes/apple-pie")).status).toBe(200)
  })

  test("deletes for good, lines and versions too", async () => {
    const soup = await (await kyle.get("/api/recipes/tomato-soup")).json()
    await kyle.delete("/api/recipes/tomato-soup")

    // Not before it's in Recently deleted.
    const pie = await (await kyle.get("/api/recipes/apple-pie")).json()
    expect((await kyle.delete(`/api/recipes/deleted/${pie.id}`)).status).toBe(
      404
    )

    expect((await kyle.delete(`/api/recipes/deleted/${soup.id}`)).status).toBe(
      204
    )
    const em = database.em.fork()
    expect(
      await em.count(RecipeIngredient, { recipe: soup.id }, ACROSS_HOUSEHOLDS)
    ).toBe(0)
    expect(
      await em.count(RecipeVersion, { recipe: soup.id }, ACROSS_HOUSEHOLDS)
    ).toBe(0)
    // Its tag went with it, as no other recipe had it.
    expect(
      (await (await kyle.get("/api/recipes/tags")).json()).map(
        (tag: { name: string }) => tag.name
      )
    ).toEqual(["Weeknight"])
  })

  test("can be emptied", async () => {
    await kyle.delete("/api/recipes/apple-pie")
    await kyle.delete("/api/recipes/new-2")

    expect((await kyle.delete("/api/recipes/deleted")).status).toBe(204)
    expect(await (await kyle.get("/api/recipes/deleted")).json()).toEqual([])
  })
})

describe("API keys", () => {
  async function key(access: "read" | "write") {
    const res = await kyle.post("/api/auth/api-keys", {
      name: `Recipes ${access}`,
      permissions: { recipes: access },
    })
    return (await res.json()).key as string
  }

  function withKey(key: string, path: string, method = "GET", body?: unknown) {
    return app.request(`${TEST_ORIGIN}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${key}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  }

  test("can read recipes with read, and add them with write", async () => {
    const reader = await key("read")
    expect((await withKey(reader, "/api/recipes")).status).toBe(200)
    expect(
      (await withKey(reader, "/api/recipes", "POST", { name: "Toast" })).status
    ).toBe(403)

    const writer = await key("write")
    const res = await withKey(writer, "/api/recipes", "POST", {
      name: "Toast",
      ingredients: ["2 slices bread"],
    })
    expect(res.status).toBe(201)
  })
})

describe("paths under /recipes", () => {
  test("Recently deleted, tags and bulk aren't taken for a recipe", async () => {
    const deleted = await add(kyle, { name: "Deleted" })
    const tags = await add(kyle, { name: "Tags" })
    const bulk = await add(kyle, { name: "Bulk" })

    expect([deleted.slug, tags.slug, bulk.slug]).toEqual([
      "deleted-2",
      "tags-2",
      "bulk-2",
    ])
    expect(
      Array.isArray(await (await kyle.get("/api/recipes/deleted")).json())
    ).toBe(true)
    expect(
      Array.isArray(await (await kyle.get("/api/recipes/tags")).json())
    ).toBe(true)
    expect((await (await kyle.get("/api/recipes/deleted-2")).json()).name).toBe(
      "Deleted"
    )
  })
})

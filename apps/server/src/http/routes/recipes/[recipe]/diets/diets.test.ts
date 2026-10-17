import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../../../app.ts"
import {
  createTestApp,
  setUpServer,
  TestClient,
} from "../../../../../test/app.ts"

let app: App
let close: () => Promise<void>
let kyle: TestClient

beforeAll(async () => {
  const test = await createTestApp()
  ;({ app, close } = test)
  kyle = await setUpServer(app, test.setupCode)
  await kyle.post("/api/recipes", {
    name: "Squash Soup",
    ingredients: ["1 butternut squash", "1 cup vegetable broth"],
    prepMinutes: 10,
    cookMinutes: 15,
  })
  await kyle.post("/api/recipes", {
    name: "Cookies",
    ingredients: ["2 cups flour", "1/2 cup butter", "2 eggs"],
    totalMinutes: 40,
  })
  await kyle.post("/api/recipes", { name: "Toast" })
})

afterAll(() => close())

const recipe = async (slug: string) =>
  (await kyle.get(`/api/recipes/${slug}`)).json()
const names = async (query: string) =>
  (await (await kyle.get(`/api/recipes${query}`)).json()).recipes
    .map((r: { name: string }) => r.name)
    .sort()
const correct = (slug: string, overrides: unknown) =>
  kyle.request("PUT", `/api/recipes/${slug}/diets`, { overrides })

describe("diet labels", () => {
  test("are worked out from the ingredients", async () => {
    expect((await recipe("squash-soup")).diets).toEqual([
      "vegetarian",
      "vegan",
      "gluten-free",
      "dairy-free",
      "egg-free",
      "nut-free",
    ])
    expect((await recipe("cookies")).diets).toEqual(["vegetarian", "nut-free"])
    // Nothing to go on, so no labels.
    expect((await recipe("toast")).diets).toEqual([])
  })

  test("find recipes with all the labels asked for", async () => {
    expect(await names("?diet=vegetarian")).toEqual(["Cookies", "Squash Soup"])
    expect(await names("?diet=vegetarian&diet=vegan")).toEqual(["Squash Soup"])
    expect((await kyle.get("/api/recipes?diet=keto")).status).toBe(400)
  })

  test("can be corrected, keeping only what differs", async () => {
    const res = await correct("cookies", {
      vegetarian: true,
      "nut-free": false,
      "egg-free": true,
    })
    const cookies = await res.json()

    expect(res.status).toBe(200)
    expect(cookies.diets).toEqual(["vegetarian", "egg-free"])
    expect(cookies.dietOverrides).toEqual({
      "egg-free": true,
      "nut-free": false,
    })
    expect(await names("?diet=egg-free")).toEqual(["Cookies", "Squash Soup"])
    expect(
      await (await kyle.get("/api/recipes/cookies/versions")).json()
    ).toEqual([])
  })

  test("keep their corrections when the recipe is edited", async () => {
    const res = await kyle.request("PUT", "/api/recipes/cookies", {
      name: "Cookies",
      ingredients: ["2 cups flour", "1/2 cup butter", "2 eggs", "1 cup pecans"],
      totalMinutes: 40,
    })
    expect((await res.json()).diets).toEqual(["vegetarian", "egg-free"])

    // Back to what the ingredients say.
    const reset = await (await correct("cookies", {})).json()
    expect(reset.diets).toEqual(["vegetarian"])
    expect(reset.dietOverrides).toEqual({})
  })

  test("only take labels Merran knows", async () => {
    expect((await correct("cookies", { keto: true })).status).toBe(400)
    expect((await correct("no-such-recipe", {})).status).toBe(404)
  })
})

describe("finding recipes by time", () => {
  test("goes by the total, or prep and cook added up", async () => {
    expect(await names("?maxMinutes=30")).toEqual(["Squash Soup"])
    expect(await names("?maxMinutes=40")).toEqual(["Cookies", "Squash Soup"])
    // A recipe without times isn't quick, just unknown.
    expect(await names("?maxMinutes=600")).not.toContain("Toast")
  })
})

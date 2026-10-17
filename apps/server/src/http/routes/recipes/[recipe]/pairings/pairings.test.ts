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
const ids: Record<string, string> = {}

beforeAll(async () => {
  const test = await createTestApp()
  ;({ app, close } = test)
  kyle = await setUpServer(app, test.setupCode)
  for (const [name, tags] of [
    ["Chicken + Rice", ["Dinner"]],
    ["Teriyaki Sauce", ["Sauce"]],
    ["Peanut Sauce", ["Sauce"]],
    ["Green Salad", ["Side"]],
  ] as const) {
    const recipe = await (
      await kyle.post("/api/recipes", { name, tags: [...tags] })
    ).json()
    ids[name] = recipe.id
  }
})

afterAll(() => close())

type Option = { name: string }
const names = (options: Option[]) => options.map((o) => o.name)
const pairings = async (slug: string) =>
  (await kyle.get(`/api/recipes/${slug}/pairings`)).json()
const add = (slug: string, body: unknown) =>
  kyle.post(`/api/recipes/${slug}/pairings`, body)

describe("what a recipe goes with", () => {
  test("starts empty", async () => {
    expect(await pairings("chicken-rice")).toEqual({
      pairings: [],
      options: [],
      pairsWith: [],
    })
  })

  test("can be particular recipes, skipping itself and repeats", async () => {
    const res = await add("chicken-rice", {
      recipes: [ids["Green Salad"], "chicken-rice", "green-salad"],
    })
    const found = await res.json()

    expect(res.status).toBe(200)
    expect(found.pairings).toMatchObject([
      { kind: "recipe", recipe: { name: "Green Salad" } },
    ])
    expect(names(found.options)).toEqual(["Green Salad"])
  })

  test("can be a whole tag, with picked recipes first", async () => {
    const found = await (await add("chicken-rice", { tag: "sauce" })).json()

    expect(found.pairings).toMatchObject([
      { kind: "recipe" },
      { kind: "tag", tag: "Sauce" },
    ])
    expect(names(found.options)).toEqual([
      "Green Salad",
      "Peanut Sauce",
      "Teriyaki Sauce",
    ])
  })

  test("takes in new recipes with the tag by themselves", async () => {
    await kyle.post("/api/recipes", { name: "Garlic Sauce", tags: ["sauce"] })
    expect(names((await pairings("chicken-rice")).options)).toContain(
      "Garlic Sauce"
    )
  })

  test("shows the other way round, on the recipes it goes with", async () => {
    expect(names((await pairings("teriyaki-sauce")).pairsWith)).toEqual([
      "Chicken + Rice",
    ])
    expect(names((await pairings("green-salad")).pairsWith)).toEqual([
      "Chicken + Rice",
    ])
  })

  test("leaves out recipes in Recently deleted, until they're back", async () => {
    await kyle.delete("/api/recipes/green-salad")
    const without = await pairings("chicken-rice")
    expect(names(without.options)).not.toContain("Green Salad")
    expect(without.pairings).toHaveLength(1)

    await kyle.post(`/api/recipes/deleted/${ids["Green Salad"]}/restore`)
    expect(names((await pairings("chicken-rice")).options)).toContain(
      "Green Salad"
    )
  })

  test("follows a tag that's renamed, and goes when it's deleted", async () => {
    const tags = await (await kyle.get("/api/recipes/tags")).json()
    const sauce = tags.find((tag: { name: string }) => tag.name === "Sauce")
    await kyle.patch(`/api/recipes/tags/${sauce.id}`, { name: "Sauces" })

    const renamed = await pairings("chicken-rice")
    expect(renamed.pairings[1]).toMatchObject({ kind: "tag", tag: "Sauces" })
    expect(names(renamed.options)).toContain("Peanut Sauce")

    await kyle.delete(`/api/recipes/tags/${sauce.id}`)
    expect((await pairings("chicken-rice")).pairings).toHaveLength(1)
  })

  test("can be taken off again", async () => {
    const [salad] = (await pairings("chicken-rice")).pairings
    const path = `/api/recipes/chicken-rice/pairings/${salad.id}`
    const res = await kyle.delete(path)

    expect(res.status).toBe(200)
    expect((await res.json()).pairings).toEqual([])
    expect((await kyle.delete(path)).status).toBe(404)
  })

  test("needs something to add, and a tag that's there", async () => {
    expect((await add("chicken-rice", {})).status).toBe(400)
    expect((await add("chicken-rice", { tag: "Dessert" })).status).toBe(400)
    expect((await add("chicken-rice", { recipes: ["nope"] })).status).toBe(404)
    expect((await add("no-such-recipe", { tag: "Dinner" })).status).toBe(404)
  })
})

import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../../app.ts"
import { createTestApp, setUpServer, TestClient } from "../../../../test/app.ts"

let app: App
let close: () => Promise<void>
let kyle: TestClient
const ids: Record<string, string> = {}

beforeAll(async () => {
  const test = await createTestApp()
  ;({ app, close } = test)
  kyle = await setUpServer(app, test.setupCode)
  for (const [name, tags] of [
    ["Soup", ["Dinner"]],
    ["Salad", []],
    ["Cake", ["Baking"]],
  ] as const) {
    const recipe = await (
      await kyle.post("/api/recipes", { name, tags: [...tags] })
    ).json()
    ids[name] = recipe.id
  }
})

afterAll(() => close())

const bulk = (body: unknown) => kyle.post("/api/recipes/bulk", body)
const tagsOf = async (slug: string) =>
  (await (await kyle.get(`/api/recipes/${slug}`)).json()).tags

describe("changing several recipes at once", () => {
  test("adds tags, keeping the ones they have", async () => {
    const res = await bulk({
      action: "addTags",
      ids: [ids.Soup, ids.Salad],
      tags: ["Weeknight", "dinner"],
    })

    expect(await res.json()).toEqual({ changed: 2 })
    expect(await tagsOf("soup")).toEqual(["Dinner", "Weeknight"])
    expect(await tagsOf("salad")).toEqual(["Dinner", "Weeknight"])
    // Nothing new to add the second time.
    expect(
      await (
        await bulk({ action: "addTags", ids: [ids.Soup], tags: ["weeknight"] })
      ).json()
    ).toEqual({ changed: 0 })
  })

  test("takes tags off, and drops a tag no recipe has", async () => {
    const res = await bulk({
      action: "removeTags",
      ids: [ids.Soup, ids.Salad, ids.Cake],
      tags: ["Weeknight"],
    })

    expect(await res.json()).toEqual({ changed: 2 })
    expect(await tagsOf("soup")).toEqual(["Dinner"])
    const tags = await (await kyle.get("/api/recipes/tags")).json()
    expect(tags.map((tag: { name: string }) => tag.name)).not.toContain(
      "Weeknight"
    )
  })

  test("moves recipes to Recently deleted", async () => {
    const res = await bulk({ action: "delete", ids: [ids.Soup, ids.Cake] })
    expect(await res.json()).toEqual({ changed: 2 })
    const left = await (await kyle.get("/api/recipes")).json()
    expect(left.recipes.map((r: { name: string }) => r.name)).toEqual(["Salad"])
    const deleted = await (await kyle.get("/api/recipes/deleted")).json()
    expect(deleted.map((r: { name: string }) => r.name).sort()).toEqual([
      "Cake",
      "Soup",
    ])
  })

  test("needs something picked, by id, and tags to change", async () => {
    expect((await bulk({ action: "delete", ids: [] })).status).toBe(400)
    expect((await bulk({ action: "delete", ids: ["soup"] })).status).toBe(400)
    expect(
      (await bulk({ action: "addTags", ids: [ids.Soup], tags: [] })).status
    ).toBe(400)
    expect((await bulk({ action: "explode", ids: [ids.Soup] })).status).toBe(
      400
    )
  })
})

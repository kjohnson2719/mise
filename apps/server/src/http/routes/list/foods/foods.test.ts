import { addDays, clockIn, weekStartOf } from "@merran/shared"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../../app.ts"
import { createTestApp, setUpServer, TestClient } from "../../../../test/app.ts"

// A household's own foods, taught on the list (docs/foods.md): "Same as…"
// joins one thing to another from now on, "Not the same" keeps a name
// apart. In a US household on UTC whose week starts on Monday.

let app: App
let close: () => Promise<void>
let kyle: TestClient
/** Next week's Monday, so nothing's in the past. */
let monday: string
const ids: Record<string, string> = {}

type Item = { id: string; name: string; amount: string }

const day = (offset: number) => addDays(monday, offset)

async function list(): Promise<Item[]> {
  const res = await kyle.get("/api/list")
  expect(res.status).toBe(200)
  return (await res.json()).items
}

const find = async (name: string) =>
  (await list()).find((item) => item.name === name)

async function type(text: string) {
  const res = await kyle.post("/api/list/items", { text })
  expect(res.status, await res.clone().text()).toBe(201)
  return (await res.json()) as Item
}

async function plan(recipe: string, offset = 0) {
  const res = await kyle.post("/api/plan/entries", {
    date: day(offset),
    meal: "dinner",
    recipe: ids[recipe],
  })
  expect(res.status, await res.clone().text()).toBe(201)
}

async function fromPlan() {
  const res = await kyle.post("/api/list/from-plan", {
    from: day(0),
    to: day(6),
  })
  expect(res.status, await res.clone().text()).toBe(200)
}

async function clearAll() {
  await kyle.post("/api/list/clear", { which: "all" })
  const entries = (
    await (await kyle.get(`/api/plan?from=${day(-7)}&to=${day(13)}`)).json()
  ).entries
  if (entries.length > 0) {
    await kyle.post("/api/plan/entries/bulk", {
      ids: entries.map((entry: { id: string }) => entry.id),
      action: "remove",
    })
  }
  for (const alias of (await (await kyle.get("/api/list/foods")).json())
    .aliases) {
    await kyle.delete(`/api/list/foods/${alias.id}`)
  }
}

beforeAll(async () => {
  const test = await createTestApp()
  ;({ app, close } = test)
  kyle = await setUpServer(app, test.setupCode)
  await kyle.patch("/api/households/current", {
    timeZone: "UTC",
    weekStartsOn: 1,
    country: "US",
  })
  monday = addDays(weekStartOf(clockIn("UTC").today, 1), 7)
  for (const recipe of [
    { name: "Shortbread", ingredients: ["2 tbsp vegan butter", "1 cup flour"] },
    { name: "Toast", ingredients: ["1 tbsp butter", "2 slices bread"] },
    { name: "Cookies", ingredients: ["2 tbsp unsalted butter", "1 egg"] },
  ]) {
    const res = await kyle.post("/api/recipes", {
      servings: 4,
      steps: ["Cook it."],
      ...recipe,
    })
    ids[recipe.name] = (await res.json()).id
  }
})

afterAll(() => close())

describe("Same as…", () => {
  test("joins one thing to another, now and on the next list", async () => {
    const vegan = await type("2 tbsp vegan butter")
    const butter = await type("1 tbsp butter")
    const res = await kyle.post(`/api/list/items/${vegan.id}/same-as`, {
      item: butter.id,
    })
    expect(res.status, await res.clone().text()).toBe(200)
    expect(await res.json()).toEqual({ food: "butter", joined: 1 })
    const items = await list()
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ amount: "3 tbsp" })
    expect((await (await kyle.get("/api/list/foods")).json()).aliases).toEqual([
      expect.objectContaining({
        name: "vegan butter",
        food: "butter",
        apart: false,
      }),
    ])

    // The recipes' lines join from now on too.
    await kyle.post("/api/list/clear", { which: "all" })
    await plan("Shortbread")
    await plan("Toast", 1)
    await fromPlan()
    const butters = (await list()).filter((item) => /butter/i.test(item.name))
    expect(butters).toHaveLength(1)
    expect(butters[0]).toMatchObject({ amount: "3 tbsp" })
    await clearAll()
  })

  test("needs something else on the list", async () => {
    const butter = await type("1 tbsp butter")
    const res = await kyle.post(`/api/list/items/${butter.id}/same-as`, {
      item: butter.id,
    })
    expect(res.status).toBe(400)
    await clearAll()
  })
})

describe("Not the same", () => {
  test("keeps a name apart from the next list on", async () => {
    await plan("Toast")
    await plan("Cookies", 1)
    await fromPlan()
    const butter = (await list()).find((item) => /butter/i.test(item.name))!
    expect(butter).toMatchObject({ amount: "3 tbsp" })

    const names = await (
      await kyle.get(`/api/list/items/${butter.id}/names`)
    ).json()
    expect(names.names).toEqual(
      expect.arrayContaining(["butter", "unsalted butter"])
    )
    const res = await kyle.post(`/api/list/items/${butter.id}/apart`, {
      names: ["unsalted butter"],
    })
    expect(await res.json()).toEqual({ kept: 1 })

    // The next list has them apart.
    await kyle.post("/api/list/clear", { which: "all" })
    await kyle.post("/api/plan/entries/bulk", {
      ids: (
        await (await kyle.get(`/api/plan?from=${day(0)}&to=${day(6)}`)).json()
      ).entries.map((entry: { id: string }) => entry.id),
      action: "remove",
    })
    await plan("Toast")
    await plan("Cookies", 1)
    await fromPlan()
    expect(await find("butter")).toMatchObject({ amount: "1 tbsp" })
    expect(await find("unsalted butter")).toMatchObject({ amount: "2 tbsp" })
    await clearAll()
  })

  test("forgetting a name makes the food Merran's again", async () => {
    const vegan = await type("2 tbsp vegan butter")
    const butter = await type("1 tbsp butter")
    await kyle.post(`/api/list/items/${vegan.id}/same-as`, { item: butter.id })
    const [alias] = (await (await kyle.get("/api/list/foods")).json()).aliases
    const res = await kyle.delete(`/api/list/foods/${alias.id}`)
    expect(res.status).toBe(200)
    expect((await (await kyle.get("/api/list/foods")).json()).aliases).toEqual(
      []
    )
    expect((await kyle.delete("/api/list/foods/not-an-id")).status).toBe(404)
    await clearAll()
  })
})

describe("a household's own foods", () => {
  test("are its own", async () => {
    const res = await kyle.post(
      "/api/list/items/00000000-0000-4000-8000-000000000000/same-as",
      { item: "00000000-0000-4000-8000-000000000001" }
    )
    expect(res.status).toBe(404)
  })
})

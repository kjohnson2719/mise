import { addDays, clockIn, weekStartOf } from "@merran/shared"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../../../app.ts"
import {
  createTestApp,
  setUpServer,
  TEST_ORIGIN,
  TestClient,
} from "../../../../../test/app.ts"

// A dislike that's left out: recipes with it are still suggested, made
// and shopped for without it, unless it's what the dish is or the
// household says the recipe needs it. In a US household on UTC.

let app: App
let close: () => Promise<void>
let kyle: TestClient
let today: string
/** Next week's Monday, so meals are still to come. */
let monday: string

const EMMA = { food: "mushrooms", level: "leave-out", who: "Emma" }

type Idea = {
  recipe: { name: string }
  why: { kind: string; foods?: unknown }[]
}

async function setTastes(avoid: unknown[]) {
  const res = await kyle.put("/api/households/current/tastes", {
    avoid,
    diets: [],
    weeknightMinutes: null,
  })
  expect(res.status, await res.clone().text()).toBe(200)
}

async function ideas(): Promise<Idea[]> {
  const slots = [0, 1, 2, 3, 4, 5, 6].map((offset) => ({
    date: addDays(monday, offset),
    meal: "dinner",
  }))
  const res = await kyle.post("/api/plan/suggest", { slots })
  expect(res.status, await res.clone().text()).toBe(200)
  return (await res.json()).suggestions
}

const names = async () =>
  [...new Set((await ideas()).map((idea) => idea.recipe.name))].sort()

const setNeeds = (slug: string, foods: unknown) =>
  kyle.put(`/api/recipes/${slug}/needs`, { foods })

async function planStirFry(date = monday) {
  const recipe = (
    await (await kyle.get("/api/recipes/chicken-stir-fry")).json()
  ).id
  const res = await kyle.post("/api/plan/entries", {
    date,
    meal: "dinner",
    recipe,
  })
  expect(res.status, await res.clone().text()).toBe(201)
  return (await res.json()) as { id: string }
}

async function listed() {
  const res = await kyle.post("/api/list/from-plan", {
    from: monday,
    to: addDays(monday, 6),
  })
  expect(res.status, await res.clone().text()).toBe(200)
  return (await (await kyle.get("/api/list")).json()).items
    .map((item: { name: string }) => item.name)
    .sort()
}

async function clearAll() {
  const entries = (
    await (
      await kyle.get(
        `/api/plan?from=${addDays(today, -7)}&to=${addDays(monday, 6)}`
      )
    ).json()
  ).entries
  if (entries.length > 0)
    await kyle.post("/api/plan/entries/bulk", {
      ids: entries.map((entry: { id: string }) => entry.id),
      action: "remove",
    })
  await kyle.post("/api/pantry/clear")
  await kyle.post("/api/list/clear", { which: "all" })
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
  today = clockIn("UTC").today
  monday = addDays(weekStartOf(today, 1), 7)
  for (const recipe of [
    {
      name: "Chicken Stir Fry",
      ingredients: [
        "1 lb chicken thighs",
        "8 oz mushrooms, sliced",
        "2 tbsp soy sauce",
      ],
    },
    {
      name: "Mushroom Risotto",
      ingredients: ["8 oz mushrooms", "1 cup arborio rice"],
    },
  ]) {
    const res = await kyle.post("/api/recipes", {
      servings: 4,
      steps: ["Cook it."],
      ...recipe,
    })
    expect(res.status, await res.clone().text()).toBe(201)
  }
})

afterAll(() => close())

describe("a dislike that's left out", () => {
  test("still has recipes with it suggested, saying so, but not one named for it", async () => {
    await setTastes([EMMA])
    const all = await ideas()
    expect(new Set(all.map((idea) => idea.recipe.name))).toEqual(
      new Set(["Chicken Stir Fry"])
    )
    expect(all[0]!.why.at(-1)).toEqual({
      kind: "leaveOut",
      foods: [{ food: "mushrooms", who: "Emma" }],
    })
  })

  test("isn't bought for a planned meal", async () => {
    await setTastes([EMMA])
    await planStirFry()
    expect(await listed()).toEqual(["chicken thighs", "soy sauce"])
    await clearAll()
  })

  test("isn't used up from the pantry when the meal's cooked", async () => {
    await setTastes([EMMA])
    await kyle.post("/api/pantry/items", { text: "8 oz mushrooms" })
    await kyle.post("/api/pantry/items", { text: "2 lb chicken thighs" })
    const meal = await planStirFry(today)
    const res = await kyle.patch(`/api/plan/entries/${meal.id}`, {
      status: "cooked",
    })
    expect(res.status, await res.clone().text()).toBe(200)
    const pantry = (await (await kyle.get("/api/pantry")).json()).items
    expect(
      pantry.map((item: { name: string; amount: string }) => [
        item.name,
        item.amount,
      ])
    ).toEqual(
      expect.arrayContaining([
        ["mushrooms", "8 oz"],
        ["chicken thighs", "1 lb"],
      ])
    )
    await clearAll()
  })

  test("rules a recipe out when the household says it needs it", async () => {
    await setTastes([EMMA])
    const res = await setNeeds("chicken-stir-fry", [" Mushrooms ", "mushrooms"])
    expect(res.status, await res.clone().text()).toBe(200)
    expect((await res.json()).needs).toEqual(["mushrooms"])
    expect(await names()).toEqual([])
    // Planned anyway, it's made and bought as written.
    await planStirFry()
    expect(await listed()).toEqual(["chicken thighs", "mushrooms", "soy sauce"])
    await clearAll()

    // And can be left out again.
    expect(
      (await (await setNeeds("chicken-stir-fry", [])).json()).needs
    ).toEqual([])
    expect(await names()).toEqual(["Chicken Stir Fry"])
  })

  test("is never left out for an allergy, or what's never eaten", async () => {
    await setTastes([{ ...EMMA, level: "allergy" }])
    expect(await names()).toEqual([])
    await setTastes([{ ...EMMA, level: "never" }])
    expect(await names()).toEqual([])
    await setTastes([])
    expect(await names()).toEqual(["Chicken Stir Fry", "Mushroom Risotto"])
  })
})

describe("what a recipe needs", () => {
  test("is nothing at first", async () => {
    expect(
      (await (await kyle.get("/api/recipes/mushroom-risotto")).json()).needs
    ).toEqual([])
  })

  test("is checked, and needs a key that writes recipes", async () => {
    expect((await setNeeds("no-such-recipe", ["mushrooms"])).status).toBe(404)
    expect((await setNeeds("chicken-stir-fry", [""])).status).toBe(400)
    const key = (
      await (
        await kyle.post("/api/auth/api-keys", {
          name: "Home Assistant",
          permissions: { recipes: "read" },
          expiresInDays: 30,
        })
      ).json()
    ).key
    const res = await app.request(
      `${TEST_ORIGIN}/api/recipes/chicken-stir-fry/needs`,
      {
        method: "PUT",
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ foods: ["mushrooms"] }),
      }
    )
    expect(res.status).toBe(403)
  })
})

import { addDays, clockIn, weekStartOf } from "@merran/shared"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../app.ts"
import {
  createTestApp,
  setUpServer,
  TEST_ORIGIN,
  TestClient,
} from "../../../test/app.ts"

// The shopping list, in a household in Britain (its aisles), on UTC, whose
// week starts on Monday.

let app: App
let close: () => Promise<void>
let kyle: TestClient
let householdId: string
/** Next week's Monday, so nothing's in the past. */
let monday: string
const ids: Record<string, string> = {}
let aisles: Record<string, string> = {}

type Item = {
  id: string
  name: string
  amount: string
  quantity: number | null
  unit: string | null
  aisle: string | null
  checked: boolean
  source: string
  meals: { id: string; name: string }[]
}

const day = (offset: number) => addDays(monday, offset)

async function list(): Promise<Item[]> {
  const res = await kyle.get("/api/list")
  expect(res.status).toBe(200)
  return (await res.json()).items
}

const find = async (name: string) =>
  (await list()).find((item) => item.name === name)

async function type(text: string, aisle?: string) {
  const res = await kyle.post("/api/list/items", { text, aisle })
  expect(res.status, await res.clone().text()).toBe(201)
  return (await res.json()) as Item
}

async function plan(body: Record<string, unknown>) {
  const res = await kyle.post("/api/plan/entries", body)
  expect(res.status, await res.clone().text()).toBe(201)
  return (await res.json()) as { id: string }
}

async function fromPlan(from = day(0), to = day(6)) {
  const res = await kyle.post("/api/list/from-plan", { from, to })
  expect(res.status, await res.clone().text()).toBe(200)
  return res.json()
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
}

const RECIPES = [
  {
    name: "Lemon Chicken",
    ingredients: [
      "2 lb chicken thighs",
      "2 lemons",
      "1 tbsp olive oil",
      "Salt to taste",
      "1/2 cup chicken stock",
    ],
  },
  {
    name: "Garlic Rice",
    ingredients: ["1 cup rice", "2 cloves garlic", "1 tbsp olive oil"],
  },
  {
    name: "Beef Tacos",
    ingredients: ["1 lb ground beef", "8 corn tortillas", "2 limes"],
  },
]

beforeAll(async () => {
  const test = await createTestApp()
  ;({ app, close } = test)
  kyle = await setUpServer(app, test.setupCode)
  householdId = (
    await (
      await kyle.patch("/api/households/current", {
        timeZone: "UTC",
        weekStartsOn: 1,
        country: "GB",
      })
    ).json()
  ).id
  monday = addDays(weekStartOf(clockIn("UTC").today, 1), 7)
  for (const recipe of RECIPES) {
    const res = await kyle.post("/api/recipes", {
      servings: 4,
      steps: ["Cook it."],
      ...recipe,
    })
    ids[recipe.name] = (await res.json()).id
  }
  await kyle.post("/api/recipes/lemon-chicken/pairings", {
    recipes: [ids["Garlic Rice"]],
  })
})

afterAll(() => close())

describe("the list", () => {
  test("starts empty, with the household's country's aisles", async () => {
    const res = await (await kyle.get("/api/list")).json()
    expect(res.items).toEqual([])
    expect(res.lists).toMatchObject([
      { name: "Shopping list", main: true, aisles: [] },
    ])
    expect(
      res.aisles.slice(0, 3).map((aisle: { name: string }) => aisle.name)
    ).toEqual(["Fruit & veg", "Bakery", "Meat & fish"])
    aisles = Object.fromEntries(
      res.aisles.map((aisle: { id: string; name: string }) => [
        aisle.name,
        aisle.id,
      ])
    )
  })

  test("takes things as typed, each in its aisle", async () => {
    expect(await type("2 lb ground beef")).toMatchObject({
      name: "ground beef",
      amount: "2 lb",
      quantity: 2,
      unit: "pound",
      aisle: aisles["Meat & fish"],
      source: "typed",
      checked: false,
    })
    expect(await type("paper towels")).toMatchObject({
      name: "paper towels",
      amount: "",
      quantity: null,
      aisle: aisles.Household,
    })
    // In aisle order: meat before household.
    expect((await list()).map((item) => item.name)).toEqual([
      "ground beef",
      "paper towels",
    ])
    await clearAll()
  })

  test("remembers where a food was moved, for next time", async () => {
    const towels = await type("paper towels")
    await kyle.patch(`/api/list/items/${towels.id}`, {
      aisle: aisles["Food cupboard"],
    })
    await clearAll()
    expect((await type("Paper towel")).aisle).toBe(aisles["Food cupboard"])
    await clearAll()
  })

  test("checks off, renames and changes amounts", async () => {
    const beef = await type("2 lb ground beef")
    const patch = (body: unknown) =>
      kyle.patch(`/api/list/items/${beef.id}`, body)
    expect(await (await patch({ checked: true })).json()).toMatchObject({
      checked: true,
    })
    expect(
      await (await patch({ name: "beef mince", amount: "half a pack" })).json()
    ).toMatchObject({
      name: "beef mince",
      amount: "half a pack",
      quantity: null,
      amountText: "half a pack",
    })
    expect(await (await patch({ amount: "500 g" })).json()).toMatchObject({
      amount: "500 g",
      quantity: 500,
      unit: "gram",
      amountText: null,
    })
    expect((await patch({ aisle: "not-an-aisle" })).status).toBe(404)
    await clearAll()
  })

  test("takes things off, and Undo puts them back", async () => {
    const towels = await type("paper towels")
    const removed = await kyle.delete(`/api/list/items/${towels.id}`)
    const before = await removed.json()
    expect(await list()).toEqual([])
    expect((await kyle.delete(`/api/list/items/${towels.id}`)).status).toBe(404)
    const res = await kyle.post("/api/list/restore", { items: [before] })
    expect((await res.json()).items).toMatchObject([
      { id: towels.id, name: "paper towels" },
    ])
    expect(await list()).toMatchObject([{ id: towels.id }])
    await clearAll()
  })
})

describe("several things at once", () => {
  test("check, move, and come off together, with Undo", async () => {
    const beef = await type("2 lb ground beef")
    const towels = await type("paper towels")
    const bulk = (body: Record<string, unknown>) =>
      kyle.post("/api/list/items/bulk", { ids: [beef.id, towels.id], ...body })

    const checked = await (await bulk({ action: "check" })).json()
    expect(checked.changed).toBe(2)
    expect((await list()).every((item) => item.checked)).toBe(true)
    await kyle.post("/api/list/restore", { items: checked.before })
    expect((await list()).some((item) => item.checked)).toBe(false)

    await bulk({ action: "aisle", aisle: aisles.Deli })
    expect((await list()).map((item) => item.aisle)).toEqual([
      aisles.Deli,
      aisles.Deli,
    ])
    expect((await bulk({ action: "aisle" })).status).toBe(400)

    const removed = await (await bulk({ action: "remove" })).json()
    expect(await list()).toEqual([])
    await kyle.post("/api/list/restore", { items: removed.before })
    expect(await list()).toHaveLength(2)
    await clearAll()
  })

  test("become every-week buys, once each", async () => {
    const towels = await type("paper towels")
    const again = await type("Paper towel")
    await kyle.post("/api/list/items/bulk", {
      ids: [towels.id, again.id],
      action: "every-week",
    })
    const weekly = (await (await kyle.get("/api/list/every-week")).json()).items
    expect(weekly).toMatchObject([{ name: "paper towels", amount: null }])
    // This week's are the every-week ones now, so they don't go on twice.
    expect((await list()).map((item) => item.source)).toEqual([
      "every-week",
      "every-week",
    ])
    await kyle.delete(`/api/list/every-week/${weekly[0].id}`)
    await clearAll()
  })

  test("checked, clear off, with Undo", async () => {
    const beef = await type("2 lb ground beef")
    await type("paper towels")
    await kyle.patch(`/api/list/items/${beef.id}`, { checked: true })
    const cleared = await (
      await kyle.post("/api/list/clear", { which: "checked" })
    ).json()
    expect(cleared.before).toMatchObject([{ id: beef.id, checked: true }])
    expect((await list()).map((item) => item.name)).toEqual(["paper towels"])
    await kyle.post("/api/list/restore", { items: cleared.before })
    expect(await list()).toHaveLength(2)
    await clearAll()
  })
})

describe("adding from the plan", () => {
  test("adds up the week's meals, scaled, with their sides", async () => {
    const chicken = await plan({
      date: day(0),
      meal: "dinner",
      recipe: ids["Lemon Chicken"],
      withRecipe: ids["Garlic Rice"],
      servings: 8,
    })
    const tacos = await plan({
      date: day(2),
      meal: "dinner",
      recipe: ids["Beef Tacos"],
    })
    // A note isn't shopped for.
    await plan({ date: day(3), meal: "dinner", note: "Leftovers" })

    const preview = await (
      await kyle.get(`/api/list/from-plan?from=${day(0)}&to=${day(6)}`)
    ).json()
    expect(preview).toMatchObject({
      meals: [
        { id: chicken.id, name: "Lemon Chicken" },
        { id: tacos.id, name: "Beef Tacos" },
      ],
      listed: 0,
    })

    expect(await fromPlan()).toEqual({
      meals: 2,
      added: 9,
      merged: 0,
      everyWeek: 0,
      onHand: ["salt"],
      inPantry: [],
    })
    const items = await list()
    const of = (name: string) => items.find((item) => item.name === name)
    // Twice the recipe: 8 servings of 4.
    expect(of("chicken thighs")).toMatchObject({
      amount: "4 lb",
      meals: [{ id: chicken.id, name: "Lemon Chicken" }],
    })
    // 2 tbsp for the chicken, and 2 tbsp for the rice, scaled to match.
    expect(of("olive oil")).toMatchObject({ quantity: 4, unit: "tablespoon" })
    expect(of("garlic")).toMatchObject({ amount: "4 cloves" })
    expect(of("ground beef")).toMatchObject({
      amount: "1 lb",
      // Where it was moved to before.
      aisle: aisles.Deli,
      meals: [{ id: tacos.id, name: "Beef Tacos" }],
    })
    expect(of("Salt")).toBeUndefined()

    // Nothing twice.
    expect(await fromPlan()).toMatchObject({ meals: 0, added: 0 })
    expect(
      (
        await (
          await kyle.get(`/api/list/from-plan?from=${day(0)}&to=${day(6)}`)
        ).json()
      ).listed
    ).toBe(2)
    await clearAll()
  })

  test("cleared off, the meals can be added again, with what's at home", async () => {
    await kyle.post("/api/pantry/items", { text: "1 tbsp olive oil" })
    await plan({ date: day(0), meal: "dinner", recipe: ids["Lemon Chicken"] })
    const preview = async () =>
      (await kyle.get(`/api/list/from-plan?from=${day(0)}&to=${day(6)}`)).json()
    expect(await fromPlan()).toMatchObject({
      meals: 1,
      inPantry: ["olive oil"],
    })

    // Bought and cleared: still on the list, so not added twice.
    const lemons = await find("lemons")
    await kyle.patch(`/api/list/items/${lemons!.id}`, { checked: true })
    await kyle.post("/api/list/clear", { which: "checked" })
    expect(await preview()).toMatchObject({ meals: [], listed: 1 })

    // All of it cleared: the meal can go on again.
    const cleared = await (
      await kyle.post("/api/list/clear", { which: "all" })
    ).json()
    expect(await preview()).toMatchObject({ listed: 0 })
    // Undo, and it's on the list as it was.
    await kyle.post("/api/list/restore", { items: cleared.before })
    expect(await preview()).toMatchObject({ meals: [], listed: 1 })

    await kyle.post("/api/list/clear", { which: "all" })
    // The oil at home is still the meal's, not needed twice.
    expect(await fromPlan()).toMatchObject({
      meals: 1,
      inPantry: ["olive oil"],
    })
    expect(await find("chicken thighs")).toMatchObject({ amount: "2 lb" })
    expect(await find("olive oil")).toBeUndefined()

    // Taking the last thing for it off does the same.
    for (const item of await list()) {
      await kyle.delete(`/api/list/items/${item.id}`)
    }
    expect(await preview()).toMatchObject({ listed: 0 })
    await kyle.post("/api/pantry/clear")
    await clearAll()
  })

  test("adds into what's on the list already", async () => {
    const typed = await type("1 lb ground beef")
    await plan({ date: day(2), meal: "dinner", recipe: ids["Beef Tacos"] })
    expect(await fromPlan()).toMatchObject({ added: 2, merged: 1 })
    expect(await find("ground beef")).toMatchObject({
      id: typed.id,
      amount: "2 lb",
      source: "typed",
      meals: [{ name: "Beef Tacos" }],
    })
    await clearAll()
  })

  test("brings the week's any-day meals, from any day of the week", async () => {
    // Kept on Monday, the week's first day; added from Thursday on.
    await plan({
      date: day(0),
      anyDay: true,
      meal: "dinner",
      recipe: ids["Garlic Rice"],
    })
    const preview = await (
      await kyle.get(`/api/list/from-plan?from=${day(3)}&to=${day(6)}`)
    ).json()
    expect(preview.meals).toMatchObject([{ name: "Garlic Rice", anyDay: true }])
    expect(await fromPlan(day(3), day(6))).toMatchObject({ meals: 1 })
    expect(await find("rice")).toMatchObject({ amount: "1 cup" })
    // Not from the next week's days.
    await clearAll()
    await plan({
      date: day(0),
      anyDay: true,
      meal: "dinner",
      recipe: ids["Garlic Rice"],
    })
    expect(await fromPlan(day(7), day(13))).toMatchObject({ meals: 0 })
    await clearAll()
  })

  test("adds to the line of the food it adds up with", async () => {
    const head = await type("1 head garlic")
    const clove = await type("1 clove garlic")
    await plan({ date: day(0), meal: "dinner", recipe: ids["Garlic Rice"] })
    await fromPlan()
    const garlic = (await list()).filter((item) => item.name === "garlic")
    expect(garlic).toMatchObject([
      { id: head.id, amount: "1 head" },
      { id: clove.id, amount: "3 cloves", meals: [{ name: "Garlic Rice" }] },
    ])
    await clearAll()
  })

  test("brings the every-week items not on the list", async () => {
    const bananas = await (
      await kyle.post("/api/list/every-week", {
        name: "Bananas",
        amount: "1 bunch",
      })
    ).json()
    expect(await fromPlan()).toMatchObject({ meals: 0, everyWeek: 1 })
    expect(await find("Bananas")).toMatchObject({
      amount: "1 bunch",
      source: "every-week",
      aisle: aisles["Fruit & veg"],
    })
    expect(await fromPlan()).toMatchObject({ everyWeek: 0 })
    await kyle.patch(`/api/list/every-week/${bananas.id}`, {
      amount: "2 bunches",
    })
    expect(
      (await (await kyle.get("/api/list/every-week")).json()).items
    ).toMatchObject([{ name: "Bananas", amount: "2 bunches" }])
    await kyle.delete(`/api/list/every-week/${bananas.id}`)
    await clearAll()
  })

  test("leaves off what's always on hand", async () => {
    expect(
      await (await kyle.get("/api/households/current/on-hand")).json()
    ).toEqual({ items: ["salt", "pepper", "water", "ice"] })
    const saved = await kyle.put("/api/households/current/on-hand", {
      items: ["Salt and pepper", "Olive oil", "black pepper", ""],
    })
    expect(await saved.json()).toEqual({
      items: ["salt", "pepper", "olive oil"],
    })
    await plan({ date: day(0), meal: "dinner", recipe: ids["Lemon Chicken"] })
    expect((await fromPlan()).onHand.sort()).toEqual(["olive oil", "salt"])
    expect(await find("olive oil")).toBeUndefined()
    await kyle.put("/api/households/current/on-hand", {
      items: ["salt", "pepper", "water", "ice"],
    })
    await clearAll()
  })

  test("takes a range of days in order, two months at most", async () => {
    const post = (from: string, to: string) =>
      kyle.post("/api/list/from-plan", { from, to })
    expect((await post(day(6), day(0))).status).toBe(400)
    expect((await post(day(0), day(70))).status).toBe(400)
    expect((await post("today", day(0))).status).toBe(400)
  })
})

describe("the list follows the plan", () => {
  const amountOf = async (name: string) => (await find(name))?.amount
  const patchMeal = (id: string, body: unknown) =>
    kyle.patch(`/api/plan/entries/${id}`, body)

  /** Lemon chicken with garlic rice on Monday, tacos on Wednesday, listed. */
  async function planAndList() {
    const chicken = await plan({
      date: day(0),
      meal: "dinner",
      recipe: ids["Lemon Chicken"],
      withRecipe: ids["Garlic Rice"],
    })
    const tacos = await plan({
      date: day(2),
      meal: "dinner",
      recipe: ids["Beef Tacos"],
    })
    await fromPlan()
    return { chicken: chicken.id, tacos: tacos.id }
  }

  test("taking a meal off takes its share off, and Undo puts it back", async () => {
    const { tacos } = await planAndList()
    const before = await (
      await kyle.delete(`/api/plan/entries/${tacos}`)
    ).json()
    expect(await find("ground beef")).toBeUndefined()
    expect(await find("limes")).toBeUndefined()
    expect(await amountOf("chicken thighs")).toBe("2 lb")

    await kyle.post("/api/plan/restore", { entries: [before] })
    expect(await find("ground beef")).toMatchObject({
      amount: "1 lb",
      meals: [{ id: tacos, name: "Beef Tacos" }],
    })
    // Back on the list, so not added twice.
    expect(await fromPlan()).toMatchObject({ meals: 0, added: 0 })
    await clearAll()
  })

  test("skipping a meal takes its share off, and Undo puts it back", async () => {
    const { chicken } = await planAndList()
    const skipped = await (
      await kyle.post("/api/plan/entries/bulk", {
        ids: [chicken],
        action: "status",
        status: "skipped",
      })
    ).json()
    // Its side's lines too.
    for (const name of ["chicken thighs", "lemons", "rice", "olive oil"])
      expect(await find(name)).toBeUndefined()
    expect(await find("ground beef")).toBeDefined()

    await kyle.post("/api/plan/restore", { entries: skipped.before })
    expect(await amountOf("chicken thighs")).toBe("2 lb")
    expect(await amountOf("rice")).toBe("1 cup")
    await clearAll()
  })

  test("more servings, or another recipe, change the list", async () => {
    const { chicken, tacos } = await planAndList()
    await patchMeal(chicken, { servings: 8 })
    expect(await amountOf("chicken thighs")).toBe("4 lb")
    expect(await amountOf("rice")).toBe("2 cups")

    // Something else: the tacos become more rice, added to the chicken's.
    await patchMeal(tacos, { recipe: ids["Garlic Rice"] })
    expect(await find("ground beef")).toBeUndefined()
    expect(await find("rice")).toMatchObject({
      amount: "3 cups",
      meals: [
        { id: chicken, name: "Lemon Chicken" },
        { id: tacos, name: "Garlic Rice" },
      ],
    })

    // A note isn't shopped for.
    await patchMeal(tacos, { note: "Leftovers" })
    expect(await amountOf("rice")).toBe("2 cups")
    await clearAll()
  })

  test("moving or cooking a meal leaves the list alone", async () => {
    const { chicken } = await planAndList()
    const items = await list()
    await patchMeal(chicken, { date: day(4) })
    await patchMeal(chicken, { status: "cooked" })
    await patchMeal(chicken, { status: "planned" })
    expect(await list()).toEqual(items)
    await clearAll()
  })

  test("leaves what's checked off, and what was there before", async () => {
    const typed = await type("1 lb ground beef")
    const { tacos } = await planAndList()
    expect(await amountOf("ground beef")).toBe("2 lb")
    const limes = (await find("limes"))!
    await kyle.patch(`/api/list/items/${limes.id}`, { checked: true })

    await kyle.delete(`/api/plan/entries/${tacos}`)
    // Typed in before the tacos came along.
    expect(await find("ground beef")).toMatchObject({
      id: typed.id,
      amount: "1 lb",
      meals: [],
    })
    // Bought already.
    expect(await find("limes")).toMatchObject({ checked: true })
    await clearAll()
  })

  test("clearing the rest of the week clears its share", async () => {
    await planAndList()
    await type("paper towels")
    await kyle.post("/api/plan/clear", { week: monday })
    expect((await list()).map((item) => item.name)).toEqual(["paper towels"])
    await clearAll()
  })
})

describe("the list", () => {
  test("is the household's own", async () => {
    const towels = await type("paper towels")
    const before = await (
      await kyle.delete(`/api/list/items/${towels.id}`)
    ).json()
    await kyle.post("/api/list/restore", { items: [before] })
    // Making a household switches the server admin to it.
    await kyle.post("/api/households", { name: "Cabin" })
    expect(await list()).toEqual([])
    expect(
      (await kyle.patch(`/api/list/items/${towels.id}`, { checked: true }))
        .status
    ).toBe(404)
    // Nor can Undo bring another household's item here.
    const res = await kyle.post("/api/list/restore", { items: [before] })
    expect((await res.json()).items).toEqual([])
    await kyle.post("/api/auth/organization/set-active", {
      organizationId: householdId,
    })
    expect(await list()).toMatchObject([{ id: towels.id, checked: false }])
    await clearAll()
  })

  test("needs a key with the list permission", async () => {
    const keyFor = async (permissions: Record<string, string>) =>
      (
        await (
          await kyle.post("/api/auth/api-keys", {
            name: "Home Assistant",
            permissions,
            expiresInDays: 30,
          })
        ).json()
      ).key
    const call = (key: string, method: string, path: string, body?: unknown) =>
      app.request(`${TEST_ORIGIN}/api${path}`, {
        method,
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    const planOnly = await keyFor({ plan: "write" })
    expect((await call(planOnly, "GET", "/list")).status).toBe(403)
    const reader = await keyFor({ list: "read" })
    expect((await call(reader, "GET", "/list")).status).toBe(200)
    expect(
      (await call(reader, "POST", "/list/items", { text: "milk" })).status
    ).toBe(403)
    expect(
      (
        await call(reader, "PUT", "/households/current/on-hand", {
          items: [],
        })
      ).status
    ).toBe(403)
    const writer = await keyFor({ list: "write" })
    expect(
      (await call(writer, "POST", "/list/items", { text: "milk" })).status
    ).toBe(201)
    await clearAll()
  })
})

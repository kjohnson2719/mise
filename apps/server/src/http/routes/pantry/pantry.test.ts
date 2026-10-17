import { addDays, clockIn, weekStartOf } from "@merran/shared"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../app.ts"
import { Purchase } from "../../../database/entities/index.ts"
import type { Database } from "../../../database/orm.ts"
import { forHousehold } from "../../../database/scope.ts"
import {
  createTestApp,
  setUpServer,
  TEST_ORIGIN,
  TestClient,
} from "../../../test/app.ts"

// What's at home, in a US household on UTC whose week starts on Monday.

let app: App
let database: Database
let close: () => Promise<void>
let kyle: TestClient
let householdId: string
let today: string
/** Next week's Monday, so meals are still to come. */
let monday: string
const ids: Record<string, string> = {}

type Item = {
  id: string
  name: string
  amount: string
  quantity: number | null
  unit: string | null
  storedIn: string | null
  useBy: string | null
  meals: { id: string; name: string; status: string }[]
  useSoon: { kind: string; date?: string } | null
}

const day = (offset: number) => addDays(monday, offset)

async function pantry(): Promise<Item[]> {
  const res = await kyle.get("/api/pantry")
  expect(res.status).toBe(200)
  return (await res.json()).items
}

const find = async (name: string) =>
  (await pantry()).find((item) => item.name === name)

async function add(text: string, storedIn?: string) {
  const res = await kyle.post("/api/pantry/items", { text, storedIn })
  expect(res.status, await res.clone().text()).toBe(201)
  return (await res.json()) as Item
}

async function plan(body: Record<string, unknown>) {
  const res = await kyle.post("/api/plan/entries", body)
  expect(res.status, await res.clone().text()).toBe(201)
  return (await res.json()) as { id: string }
}

async function fromPlan() {
  const res = await kyle.post("/api/list/from-plan", {
    from: day(0),
    to: day(6),
  })
  expect(res.status, await res.clone().text()).toBe(200)
  return res.json()
}

const listed = async (name: string) =>
  (await (await kyle.get("/api/list")).json()).items.find(
    (item: { name: string }) => item.name === name
  )

/** Meals first: taking a cooked one off puts back what it used. */
async function clearAll() {
  const entries = (
    await (await kyle.get(`/api/plan?from=${day(-14)}&to=${day(13)}`)).json()
  ).entries
  if (entries.length > 0) {
    await kyle.post("/api/plan/entries/bulk", {
      ids: entries.map((entry: { id: string }) => entry.id),
      action: "remove",
    })
  }
  await kyle.post("/api/pantry/clear")
  await kyle.post("/api/list/clear", { which: "all" })
}

beforeAll(async () => {
  const test = await createTestApp()
  ;({ app, database, close } = test)
  kyle = await setUpServer(app, test.setupCode)
  householdId = (
    await (
      await kyle.patch("/api/households/current", {
        timeZone: "UTC",
        weekStartsOn: 1,
        country: "US",
      })
    ).json()
  ).id
  today = clockIn("UTC").today
  monday = addDays(weekStartOf(today, 1), 7)
  for (const recipe of [
    {
      name: "Lemon Chicken",
      ingredients: ["2 lb chicken thighs", "2 lemons", "1 cup rice"],
    },
    {
      name: "Chicken Stir Fry",
      ingredients: ["2 lb chicken thighs", "1 cup rice", "2 tbsp soy sauce"],
    },
    {
      name: "Spinach Frittata",
      ingredients: ["6 eggs", "4 cups spinach"],
    },
    {
      name: "Pepper Hash",
      ingredients: [
        "2 bell peppers",
        "1 red bell pepper",
        "1 green bell pepper",
      ],
    },
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

describe("the pantry", () => {
  test("takes things as typed, kept where the food goes", async () => {
    expect(await add("2 lb chicken thighs")).toMatchObject({
      name: "chicken thighs",
      amount: "2 lb",
      storedIn: "fridge",
      useBy: addDays(today, 3),
      useSoon: null,
    })
    expect(await add("rice")).toMatchObject({
      amount: "",
      storedIn: "cupboard",
      useBy: null,
    })
    expect(await add("frozen peas")).toMatchObject({
      storedIn: "freezer",
      useBy: null,
    })
    expect(await add("1 lb chicken thighs", "freezer")).toMatchObject({
      storedIn: "freezer",
      useBy: null,
    })
    // The fridge first, then the freezer, then the cupboard.
    expect((await pantry()).map((item) => item.storedIn)).toEqual([
      "fridge",
      "freezer",
      "freezer",
      "cupboard",
    ])
    await clearAll()
  })

  test("adds the same food kept in the same place together", async () => {
    await add("2 lb chicken thighs")
    const more = await add("1 lb boneless skinless chicken thighs")
    expect(more).toMatchObject({ amount: "3 lb" })
    expect(await pantry()).toHaveLength(1)
    await clearAll()
  })

  test("changes things, the freezer taking the use-by date off", async () => {
    const chicken = await add("2 lb chicken thighs")
    const patch = (body: unknown) =>
      kyle.patch(`/api/pantry/items/${chicken.id}`, body)
    expect(await (await patch({ storedIn: "freezer" })).json()).toMatchObject({
      storedIn: "freezer",
      useBy: null,
    })
    expect(
      await (await patch({ amount: "half a pack", useBy: day(2) })).json()
    ).toMatchObject({ amount: "half a pack", quantity: null, useBy: day(2) })
    expect((await patch({ aisle: "nope" })).status).toBe(404)
    expect(
      (await kyle.patch("/api/pantry/items/nope", { name: "x" })).status
    ).toBe(404)
    await clearAll()
  })

  test("says what to use soon", async () => {
    const chicken = await add("2 lb chicken thighs")
    await kyle.patch(`/api/pantry/items/${chicken.id}`, {
      useBy: addDays(today, -1),
    })
    expect((await find("chicken thighs"))?.useSoon).toEqual({
      kind: "past",
      date: addDays(today, -1),
    })
    await kyle.patch(`/api/pantry/items/${chicken.id}`, { useBy: today })
    expect((await find("chicken thighs"))?.useSoon).toEqual({
      kind: "soon",
      date: today,
    })
    await clearAll()
  })

  test("uses things up and empties, with Undo", async () => {
    const rice = await add("rice")
    const peas = await add("frozen peas")
    const gone = await (
      await kyle.delete(`/api/pantry/items/${rice.id}`)
    ).json()
    expect(await pantry()).toHaveLength(1)
    await kyle.post("/api/pantry/restore", { items: [gone] })
    expect(await pantry()).toHaveLength(2)

    const moved = await (
      await kyle.post("/api/pantry/items/bulk", {
        ids: [rice.id, peas.id],
        action: "storedIn",
        storedIn: "fridge",
      })
    ).json()
    expect(moved.changed).toBe(2)
    expect((await pantry()).every((item) => item.storedIn === "fridge")).toBe(
      true
    )
    await kyle.post("/api/pantry/restore", { items: moved.before })
    expect((await find("frozen peas"))?.storedIn).toBe("freezer")

    const emptied = await (await kyle.post("/api/pantry/clear")).json()
    expect(await pantry()).toEqual([])
    await kyle.post("/api/pantry/restore", { items: emptied.before })
    expect(await pantry()).toHaveLength(2)
    await clearAll()
  })
})

describe("putting the shopping away", () => {
  test("puts what's checked off in the pantry, and in the purchase history", async () => {
    const chicken = await plan({
      date: day(0),
      meal: "dinner",
      recipe: ids["Lemon Chicken"],
    })
    await fromPlan()
    await kyle.post("/api/list/items", { text: "paper towels" })
    await kyle.post("/api/list/items", { text: "salt" })
    await kyle.post("/api/list/items", { text: "milk" })
    const list = (await (await kyle.get("/api/list")).json()).items as {
      id: string
      name: string
    }[]
    await kyle.post("/api/list/items/bulk", {
      ids: list.filter((item) => item.name !== "milk").map((item) => item.id),
      action: "check",
    })

    const res = await kyle.post("/api/list/put-away", {})
    // Not paper towels or salt: a household thing, and always on hand.
    expect(await res.json()).toEqual({ stored: 3, cleared: 2 })
    expect(
      (await (await kyle.get("/api/list")).json()).items.map(
        (item: { name: string }) => item.name
      )
    ).toEqual(["milk"])
    expect(await find("chicken thighs")).toMatchObject({
      amount: "2 lb",
      storedIn: "fridge",
      useBy: addDays(today, 3),
      meals: [{ id: chicken.id, name: "Lemon Chicken", status: "planned" }],
    })
    expect((await find("lemons"))?.storedIn).toBe("cupboard")

    const em = forHousehold(database.em.fork(), householdId)
    const bought = await em.find(Purchase, {}, { orderBy: { name: "asc" } })
    expect(bought.map((purchase) => purchase.name).sort()).toEqual(
      ["chicken thighs", "lemons", "paper towels", "rice", "salt"].sort()
    )
    expect(bought.every((purchase) => purchase.boughtOn === today)).toBe(true)
    await clearAll()
  })
})

describe("the list counts on what's at home", () => {
  test("once: the next meal doesn't count on the same stock", async () => {
    await add("2 lb chicken thighs")
    const first = await plan({
      date: day(0),
      meal: "dinner",
      recipe: ids["Lemon Chicken"],
    })
    const result = await fromPlan()
    expect(result.inPantry).toContain("chicken thighs")
    expect(await listed("chicken thighs")).toBeUndefined()
    expect((await find("chicken thighs"))?.meals).toMatchObject([
      { id: first.id },
    ])

    // Another chicken meal needs its own.
    await plan({
      date: day(2),
      meal: "dinner",
      recipe: ids["Chicken Stir Fry"],
    })
    await fromPlan()
    expect(await listed("chicken thighs")).toMatchObject({ amount: "2 lb" })
    await clearAll()
  })

  test("for what it has, and the rest goes on the list", async () => {
    await add("1 lb chicken thighs")
    await plan({ date: day(0), meal: "dinner", recipe: ids["Lemon Chicken"] })
    await fromPlan()
    expect(await listed("chicken thighs")).toMatchObject({ amount: "1 lb" })
    await clearAll()
  })

  test("and frees it when the meal comes off the plan", async () => {
    await add("2 lb chicken thighs")
    const first = await plan({
      date: day(0),
      meal: "dinner",
      recipe: ids["Lemon Chicken"],
    })
    await fromPlan()
    await kyle.delete(`/api/plan/entries/${first.id}`)
    expect((await find("chicken thighs"))?.meals).toEqual([])
    await plan({
      date: day(2),
      meal: "dinner",
      recipe: ids["Chicken Stir Fry"],
    })
    expect((await fromPlan()).inPantry).toContain("chicken thighs")
    await clearAll()
  })

  test("a kind of a food at home covers it, not the other way", async () => {
    // Green bell peppers at home: the recipe's bell peppers are covered,
    // its red one isn't, and its green one has none left.
    await add("3 green bell peppers")
    await plan({ date: day(0), meal: "dinner", recipe: ids["Pepper Hash"] })
    const result = await fromPlan()
    expect(result.inPantry).toContain("bell peppers")
    expect(await listed("bell peppers")).toBeUndefined()
    expect(await listed("red bell pepper")).toBeDefined()
    expect(await listed("green bell pepper")).toBeUndefined()
    await clearAll()

    // With nothing at home, the list keeps the kinds apart.
    await plan({ date: day(0), meal: "dinner", recipe: ids["Pepper Hash"] })
    await fromPlan()
    expect(await listed("bell peppers")).toMatchObject({ amount: "2" })
    expect(await listed("red bell pepper")).toMatchObject({ amount: "1" })
    expect(await listed("green bell pepper")).toMatchObject({ amount: "1" })
    await clearAll()
  })
})

describe("cooking", () => {
  test("uses up what it takes, and puts it back when it wasn't cooked", async () => {
    await add("3 lb chicken thighs")
    const meal = await plan({
      date: today,
      meal: "dinner",
      recipe: ids["Lemon Chicken"],
    })
    const patch = (body: unknown) =>
      kyle.patch(`/api/plan/entries/${meal.id}`, body)

    await patch({ status: "cooked" })
    expect(await find("chicken thighs")).toMatchObject({ amount: "1 lb" })
    await patch({ status: "planned" })
    expect(await find("chicken thighs")).toMatchObject({ amount: "3 lb" })

    // Taking a cooked meal off puts it back too, and Undo uses it again.
    await patch({ status: "cooked" })
    const before = await (
      await kyle.delete(`/api/plan/entries/${meal.id}`)
    ).json()
    expect(await find("chicken thighs")).toMatchObject({ amount: "3 lb" })
    await kyle.post("/api/plan/restore", { entries: [before] })
    expect(await find("chicken thighs")).toMatchObject({ amount: "1 lb" })
    await clearAll()
  })

  test("uses up what was set aside for it, and brings it back whole", async () => {
    await add("2 lb chicken thighs")
    const meal = await plan({
      date: day(0),
      meal: "dinner",
      recipe: ids["Lemon Chicken"],
    })
    await fromPlan()
    await kyle.patch(`/api/plan/entries/${meal.id}`, { status: "cooked" })
    expect(await find("chicken thighs")).toBeUndefined()
    await kyle.patch(`/api/plan/entries/${meal.id}`, { status: "planned" })
    expect(await find("chicken thighs")).toMatchObject({
      amount: "2 lb",
      meals: [{ id: meal.id }],
    })
    await clearAll()
  })

  test("leaves what has no amount, unless it was for the meal", async () => {
    await add("rice")
    const meal = await plan({
      date: today,
      meal: "dinner",
      recipe: ids["Lemon Chicken"],
    })
    await kyle.patch(`/api/plan/entries/${meal.id}`, { status: "cooked" })
    expect(await find("rice")).toBeDefined()
    await clearAll()
  })
})

describe("using soon", () => {
  test("counts fresh food from a skipped meal, and Fill the week uses it up", async () => {
    const frittata = await plan({
      date: day(0),
      meal: "dinner",
      recipe: ids["Spinach Frittata"],
    })
    await fromPlan()
    const list = (await (await kyle.get("/api/list")).json()).items
    await kyle.post("/api/list/items/bulk", {
      ids: list.map((item: { id: string }) => item.id),
      action: "check",
    })
    await kyle.post("/api/list/put-away", {})
    await kyle.patch(`/api/plan/entries/${frittata.id}`, { status: "skipped" })
    expect((await find("spinach"))?.useSoon).toEqual({ kind: "leftover" })

    const res = await kyle.post("/api/plan/suggest", {
      slots: [{ date: day(3), meal: "dinner" }],
      exclude: [
        ids["Lemon Chicken"],
        ids["Chicken Stir Fry"],
        ids["Pepper Hash"],
      ],
    })
    const [idea] = (await res.json()).suggestions
    expect(idea).toMatchObject({ recipe: { name: "Spinach Frittata" } })
    // A skipped meal wasn't had, so it can come round again; its eggs
    // need using too.
    expect(idea.why[0]).toEqual({ kind: "usesUp", foods: ["spinach", "eggs"] })
    await clearAll()
  })
})

describe("the pantry", () => {
  test("needs a key with the pantry permission, and the list's to put away", async () => {
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
    const reader = await keyFor({ pantry: "read" })
    expect((await call(reader, "GET", "/pantry")).status).toBe(200)
    expect(
      (await call(reader, "POST", "/pantry/items", { text: "rice" })).status
    ).toBe(403)
    expect((await call(reader, "POST", "/list/put-away", {})).status).toBe(403)
  })

  test("is the household's own", async () => {
    const rice = await add("rice")
    await kyle.post("/api/households", { name: "Cabin" })
    expect(await pantry()).toEqual([])
    expect(
      (await kyle.patch(`/api/pantry/items/${rice.id}`, { name: "x" })).status
    ).toBe(404)
    await kyle.post("/api/auth/organization/set-active", {
      organizationId: householdId,
    })
    expect(await pantry()).toMatchObject([{ id: rice.id }])
    await clearAll()
  })
})

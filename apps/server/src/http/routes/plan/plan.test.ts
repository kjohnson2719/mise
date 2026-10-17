import { addDays, clockIn, weekStartOf } from "@merran/shared"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../app.ts"
import {
  createTestApp,
  setUpServer,
  TEST_ORIGIN,
  TestClient,
} from "../../../test/app.ts"

// The week plan, in a household on UTC whose week starts on Monday.

let app: App
let close: () => Promise<void>
let kyle: TestClient
let today: string
let week: string
const ids: Record<string, string> = {}

const plan = async (from = week, to = addDays(week, 6)) =>
  (await (await kyle.get(`/api/plan?from=${from}&to=${to}`)).json()).entries

async function add(body: Record<string, unknown>) {
  const res = await kyle.post("/api/plan/entries", body)
  expect(res.status, await res.clone().text()).toBe(201)
  return res.json()
}

const clearAll = async () => {
  const entries = await plan(addDays(week, -14), addDays(week, 20))
  if (entries.length === 0) return
  await kyle.post("/api/plan/entries/bulk", {
    ids: entries.map((entry: { id: string }) => entry.id),
    action: "remove",
  })
}

beforeAll(async () => {
  const test = await createTestApp()
  ;({ app, close } = test)
  kyle = await setUpServer(app, test.setupCode)
  await kyle.patch("/api/households/current", {
    timeZone: "UTC",
    weekStartsOn: 1,
  })
  today = clockIn("UTC").today
  week = weekStartOf(today, 1)
  for (const name of ["Tomato Soup", "Soda Bread", "Garlic Rice"]) {
    const recipe = await (
      await kyle.post("/api/recipes", {
        name,
        servings: 4,
        ingredients: ["1 onion"],
        steps: ["Cook it."],
      })
    ).json()
    ids[recipe.slug] = recipe.id
  }
})

afterAll(() => close())

describe("the household's meals", () => {
  test("are every meal until it opts out, in a day's order", async () => {
    expect(
      (await (await kyle.get("/api/households/current")).json()).meals
    ).toEqual(["breakfast", "lunch", "dinner", "snack"])
    const res = await kyle.patch("/api/households/current", {
      meals: ["dinner", "breakfast"],
    })
    expect((await res.json()).meals).toEqual(["breakfast", "dinner"])
    expect(
      (await kyle.patch("/api/households/current", { meals: [] })).status
    ).toBe(400)
  })
})

describe("meals on the plan", () => {
  test("go on days, or in the week's pool", async () => {
    const soup = await add({
      date: today,
      meal: "dinner",
      recipe: "tomato-soup",
      withRecipe: "garlic-rice",
    })
    expect(soup).toMatchObject({
      date: today,
      anyDay: false,
      meal: "dinner",
      position: 0,
      status: "planned",
      recipe: { slug: "tomato-soup", servings: 4 },
      withRecipe: { slug: "garlic-rice" },
      note: null,
      servings: null,
    })
    // Any day this week: dated to the week's first day.
    const pooled = await add({
      date: today,
      meal: "dinner",
      anyDay: true,
      recipe: ids["soda-bread"],
    })
    expect(pooled).toMatchObject({ date: week, anyDay: true })
    const note = await add({
      date: addDays(today, 1),
      meal: "dinner",
      note: " Leftovers ",
    })
    expect(note).toMatchObject({ note: "Leftovers", recipe: null })

    const entries = await plan()
    expect(entries.map((entry: { id: string }) => entry.id)).toEqual(
      [pooled.id, soup.id, note.id].sort(
        (a, b) =>
          entries.findIndex((e: { id: string }) => e.id === a) -
          entries.findIndex((e: { id: string }) => e.id === b)
      )
    )
    // The pool comes first on the week's first day.
    const first = entries.findIndex((e: { id: string }) => e.id === pooled.id)
    const day = entries.findIndex((e: { id: string }) => e.id === soup.id)
    expect(first).toBeLessThan(day)
  })

  test("are a recipe or a note, never both or neither", async () => {
    for (const body of [
      { date: today, meal: "dinner" },
      { date: today, meal: "dinner", recipe: "tomato-soup", note: "Out" },
    ]) {
      expect((await kyle.post("/api/plan/entries", body)).status).toBe(400)
    }
    const sideless = await kyle.post("/api/plan/entries", {
      date: today,
      meal: "dinner",
      note: "Out",
      withRecipe: "garlic-rice",
    })
    expect((await sideless.json()).error.code).toBe("side_needs_recipe")
    expect(
      (
        await kyle.post("/api/plan/entries", {
          date: "2026-02-30",
          meal: "dinner",
          note: "Out",
        })
      ).status
    ).toBe(400)
    expect(
      (
        await kyle.post("/api/plan/entries", {
          date: today,
          meal: "dinner",
          recipe: "no-such-recipe",
        })
      ).status
    ).toBe(404)
  })

  test("moved, go after what's there", async () => {
    const [soup] = (await plan()).filter(
      (entry: { recipe: { slug: string } | null; anyDay: boolean }) =>
        entry.recipe?.slug === "tomato-soup" && !entry.anyDay
    )
    const res = await kyle.patch(`/api/plan/entries/${soup.id}`, {
      date: addDays(today, 1),
    })
    // Tomorrow's leftovers are first.
    expect(await res.json()).toMatchObject({
      date: addDays(today, 1),
      position: 1,
    })
  })

  test("cooked, say when the recipe and its side were last made", async () => {
    const [soup] = (await plan()).filter(
      (entry: { recipe: { slug: string } | null; anyDay: boolean }) =>
        entry.recipe?.slug === "tomato-soup" && !entry.anyDay
    )
    await kyle.patch(`/api/plan/entries/${soup.id}`, { status: "cooked" })
    for (const slug of ["tomato-soup", "garlic-rice"]) {
      const recipe = await (await kyle.get(`/api/recipes/${slug}`)).json()
      expect(recipe.lastMadeAt, slug).not.toBeNull()
    }
  })

  test("swapped for something else, keep the side and start over", async () => {
    const [soup] = (await plan()).filter(
      (entry: { recipe: { slug: string } | null; anyDay: boolean }) =>
        entry.recipe?.slug === "tomato-soup" && !entry.anyDay
    )
    const res = await kyle.patch(`/api/plan/entries/${soup.id}`, {
      recipe: "soda-bread",
    })
    expect(await res.json()).toMatchObject({
      recipe: { slug: "soda-bread" },
      withRecipe: { slug: "garlic-rice" },
      status: "planned",
    })
  })

  test("taken off, can be put back as they were", async () => {
    const meal = await add({ date: today, meal: "dinner", note: "Eat out" })
    const res = await kyle.delete(`/api/plan/entries/${meal.id}`)
    const was = await res.json()
    expect(was).toMatchObject({ id: meal.id, note: "Eat out" })
    const back = await kyle.post("/api/plan/restore", { entries: [was] })
    expect((await back.json()).entries).toMatchObject([
      { id: meal.id, note: "Eat out", date: today },
    ])
  })
})

describe("several meals at once", () => {
  test("change all together, and Undo puts them back", async () => {
    await clearAll()
    const a = await add({ date: today, meal: "dinner", recipe: "tomato-soup" })
    const b = await add({
      date: addDays(today, 1),
      meal: "dinner",
      recipe: "soda-bread",
    })

    const skipped = await (
      await kyle.post("/api/plan/entries/bulk", {
        ids: [a.id, b.id],
        action: "status",
        status: "skipped",
      })
    ).json()
    expect(
      skipped.entries.map((entry: { status: string }) => entry.status)
    ).toEqual(["skipped", "skipped"])
    expect(
      skipped.before.map((entry: { status: string }) => entry.status)
    ).toEqual(["planned", "planned"])

    const moved = await (
      await kyle.post("/api/plan/entries/bulk", {
        ids: [a.id, b.id],
        action: "move",
        date: today,
        anyDay: true,
      })
    ).json()
    expect(moved.entries).toMatchObject([
      { anyDay: true, date: week, position: 0 },
      { anyDay: true, date: week, position: 1 },
    ])

    const removed = await (
      await kyle.post("/api/plan/entries/bulk", {
        ids: [a.id, b.id],
        action: "remove",
      })
    ).json()
    expect(removed.entries).toEqual([])
    expect(await plan()).toEqual([])

    await kyle.post("/api/plan/restore", { entries: removed.before })
    await kyle.post("/api/plan/restore", { entries: moved.before })
    await kyle.post("/api/plan/restore", { entries: skipped.before })
    expect(await plan()).toMatchObject([
      { id: a.id, date: today, anyDay: false, status: "planned" },
      { id: b.id, date: addDays(today, 1), anyDay: false, status: "planned" },
    ])
  })
})

describe("a week", () => {
  test("can repeat last week's, into what's still empty", async () => {
    await clearAll()
    const last = addDays(week, -7)
    await add({ date: last, meal: "dinner", recipe: "tomato-soup" })
    await add({ date: addDays(last, 1), meal: "dinner", recipe: "soda-bread" })
    await add({ date: addDays(last, 2), meal: "dinner", note: "Pizza out" })
    const skipped = await add({
      date: addDays(last, 3),
      meal: "dinner",
      recipe: "garlic-rice",
    })
    await kyle.patch(`/api/plan/entries/${skipped.id}`, { status: "skipped" })
    await add({
      date: last,
      meal: "dinner",
      anyDay: true,
      recipe: "garlic-rice",
    })
    // Tuesday this week is taken already.
    await add({ date: addDays(week, 1), meal: "dinner", note: "Busy" })

    const res = await kyle.post("/api/plan/repeat", { week })
    const { entries } = await res.json()
    expect(
      entries.map(
        (entry: {
          date: string
          anyDay: boolean
          recipe: { slug: string } | null
          note: string | null
        }) => [entry.date, entry.anyDay, entry.recipe?.slug ?? entry.note]
      )
    ).toEqual([
      [week, true, "garlic-rice"],
      [week, false, "tomato-soup"],
      [addDays(week, 2), false, "Pizza out"],
    ])
    // Again: nothing more to copy.
    expect(
      (await (await kyle.post("/api/plan/repeat", { week })).json()).entries
    ).toEqual([])
  })

  test("can clear what's still planned for the rest of it", async () => {
    await clearAll()
    const next = addDays(week, 7)
    const kept = await add({ date: next, meal: "dinner", recipe: "soda-bread" })
    await kyle.patch(`/api/plan/entries/${kept.id}`, { status: "cooked" })
    const gone = await add({
      date: addDays(next, 1),
      meal: "dinner",
      recipe: "tomato-soup",
    })
    const pooled = await add({
      date: next,
      meal: "dinner",
      anyDay: true,
      note: "Tacos",
    })

    const { before } = await (
      await kyle.post("/api/plan/clear", { week: next })
    ).json()
    expect(before.map((entry: { id: string }) => entry.id).sort()).toEqual(
      [gone.id, pooled.id].sort()
    )
    expect(
      (await plan(next, addDays(next, 6))).map((e: { id: string }) => e.id)
    ).toEqual([kept.id])

    await kyle.post("/api/plan/restore", { entries: before })
    expect(await plan(next, addDays(next, 6))).toHaveLength(3)
  })
})

describe("what's next", () => {
  test("is the next meal still planned, not the pool or a snack", async () => {
    await clearAll()
    await add({ date: today, meal: "snack", note: "Popcorn" })
    await add({ date: today, meal: "dinner", anyDay: true, note: "Tacos" })
    const tomorrow = await add({
      date: addDays(today, 1),
      meal: "dinner",
      recipe: "tomato-soup",
    })
    const next = await (await kyle.get("/api/plan/next")).json()
    expect(next).toMatchObject({
      today,
      entry: { id: tomorrow.id, recipe: { slug: "tomato-soup" } },
    })
    expect(["breakfast", "lunch", "dinner"]).toContain(next.mealNow)
  })
})

describe("making a recipe", () => {
  test("marks today's meal of it cooked, or brings it from the pool", async () => {
    await clearAll()
    const tonight = await add({
      date: today,
      meal: "dinner",
      recipe: "tomato-soup",
    })
    await kyle.post(`/api/recipes/${ids["tomato-soup"]}/made`)
    expect((await plan(today, today))[0]).toMatchObject({
      id: tonight.id,
      status: "cooked",
    })

    const pooled = await add({
      date: today,
      meal: "dinner",
      anyDay: true,
      recipe: "soda-bread",
    })
    await kyle.post(`/api/recipes/${ids["soda-bread"]}/made`)
    const made = (await plan(week, addDays(week, 6))).find(
      (entry: { id: string }) => entry.id === pooled.id
    )
    expect(made).toMatchObject({ date: today, anyDay: false, status: "cooked" })
  })
})

describe("when a recipe was last made", () => {
  // Recipes of their own, never made before.
  const fresh = async (name: string) => {
    const recipe = await (await kyle.post("/api/recipes", { name })).json()
    ids[recipe.slug] = recipe.id
    return recipe.slug as string
  }
  const madeAt = async (slug: string) =>
    (await (await kyle.get(`/api/recipes/${slug}`)).json()).lastMadeAt as
      string | null
  const madeAll = (slugs: string[]) => Promise.all(slugs.map(madeAt))
  const cook = (id: string, status = "cooked") =>
    kyle.patch(`/api/plan/entries/${id}`, { status })
  const bulk = async (ids: string[], body: Record<string, unknown>) =>
    (await kyle.post("/api/plan/entries/bulk", { ids, ...body })).json()
  const restore = (entries: unknown[]) =>
    kyle.post("/api/plan/restore", { entries })

  test("goes back when a meal stops being cooked", async () => {
    await clearAll()
    const [stew, salad] = [
      await fresh("Lentil Stew"),
      await fresh("Green Salad"),
    ]
    const meal = await add({
      date: today,
      meal: "dinner",
      recipe: stew,
      withRecipe: salad,
    })
    await cook(meal.id)
    expect((await madeAll([stew, salad])).every(Boolean)).toBe(true)

    // Not cooked yet, after all.
    await cook(meal.id, "planned")
    expect(await madeAll([stew, salad])).toEqual([null, null])

    await cook(meal.id)
    await cook(meal.id, "skipped")
    expect(await madeAll([stew, salad])).toEqual([null, null])
  })

  test("is the latest meal still cooked, or when it was made off the plan", async () => {
    await clearAll()
    const pie = await fresh("Apple Pie")
    // Made with no meal of it planned.
    await kyle.post(`/api/recipes/${pie}/made`)
    const offPlan = await madeAt(pie)
    expect(offPlan).not.toBeNull()

    const monday = await add({ date: week, meal: "dinner", recipe: pie })
    await cook(monday.id)
    const first = await madeAt(pie)
    expect(first! >= offPlan!).toBe(true)
    const tonight = await add({ date: today, meal: "dinner", recipe: pie })
    await cook(tonight.id)
    await cook(tonight.id, "planned")
    expect(await madeAt(pie)).toBe(first)
    await cook(monday.id, "planned")
    expect(await madeAt(pie)).toBe(offPlan)
  })

  test("from making it, goes back with its meal", async () => {
    await clearAll()
    const curry = await fresh("Pea Curry")
    const tonight = await add({ date: today, meal: "dinner", recipe: curry })
    const made = await (await kyle.post(`/api/recipes/${curry}/made`)).json()
    expect(made.lastMadeAt).not.toBeNull()
    // Today's meal of it said it was made, so taking that back undoes it.
    await cook(tonight.id, "planned")
    expect(await madeAt(curry)).toBeNull()
  })

  test("goes back when its cooked meal is swapped or taken off, and Undo brings it back", async () => {
    await clearAll()
    const [tacos, slaw, soup] = [
      await fresh("Fish Tacos"),
      await fresh("Lime Slaw"),
      await fresh("Corn Soup"),
    ]
    const meal = await add({
      date: today,
      meal: "dinner",
      recipe: tacos,
      withRecipe: slaw,
    })
    await cook(meal.id)
    const cooked = await madeAll([tacos, slaw])

    const removed = await (
      await kyle.delete(`/api/plan/entries/${meal.id}`)
    ).json()
    expect(await madeAll([tacos, slaw])).toEqual([null, null])
    await restore([removed])
    // When it was cooked, not when it came back.
    expect(await madeAll([tacos, slaw])).toEqual(cooked)

    // Something else: a new meal to cook, so the tacos weren't made.
    await kyle.patch(`/api/plan/entries/${meal.id}`, { recipe: soup })
    expect(await madeAll([tacos, slaw, soup])).toEqual([null, null, null])
  })

  test("goes back for several meals at once, and Undo brings it back", async () => {
    await clearAll()
    const [chili, bread, rice] = [
      await fresh("Bean Chili"),
      await fresh("Corn Bread"),
      await fresh("Brown Rice"),
    ]
    const a = await add({
      date: today,
      meal: "dinner",
      recipe: chili,
      withRecipe: rice,
    })
    const b = await add({
      date: addDays(today, 1),
      meal: "dinner",
      recipe: bread,
    })
    const slugs = [chili, bread, rice]

    const marked = await bulk([a.id, b.id], {
      action: "status",
      status: "cooked",
    })
    const cooked = await madeAll(slugs)
    expect(cooked.every(Boolean)).toBe(true)
    // Undo: they weren't cooked.
    await restore(marked.before)
    expect(await madeAll(slugs)).toEqual([null, null, null])

    await bulk([a.id, b.id], { action: "status", status: "cooked" })
    const again = await madeAll(slugs)
    const unmarked = await bulk([a.id, b.id], {
      action: "status",
      status: "planned",
    })
    expect(await madeAll(slugs)).toEqual([null, null, null])
    await restore(unmarked.before)
    expect(await madeAll(slugs)).toEqual(again)

    const removed = await bulk([a.id, b.id], { action: "remove" })
    expect(await madeAll(slugs)).toEqual([null, null, null])
    await restore(removed.before)
    expect(await madeAll(slugs)).toEqual(again)
  })
})

describe("a recipe in Recently deleted", () => {
  test("takes its meals off the plan until it's back", async () => {
    await clearAll()
    await add({ date: today, meal: "dinner", recipe: "garlic-rice" })
    await kyle.delete("/api/recipes/garlic-rice")
    expect(await plan()).toEqual([])
    await kyle.post(`/api/recipes/deleted/${ids["garlic-rice"]}/restore`)
    expect(await plan()).toHaveLength(1)
  })
})

describe("the plan", () => {
  test("is the household's own", async () => {
    await clearAll()
    const home = (await (await kyle.get("/api/households/current")).json()).id
    const meal = await add({ date: today, meal: "dinner", note: "Ours" })
    // Making a household switches the server admin to it.
    await kyle.post("/api/households", { name: "Cabin" })
    expect(await plan()).toEqual([])
    expect(
      (await kyle.patch(`/api/plan/entries/${meal.id}`, { note: "Mine" }))
        .status
    ).toBe(404)
    expect((await kyle.delete(`/api/plan/entries/${meal.id}`)).status).toBe(404)
    // Nor can Undo bring another household's meal here.
    const res = await kyle.post("/api/plan/restore", {
      entries: [
        {
          id: meal.id,
          date: today,
          anyDay: false,
          meal: "dinner",
          position: 0,
          status: "planned",
          recipe: null,
          withRecipe: null,
          note: "Mine",
          servings: null,
          listedAt: null,
        },
      ],
    })
    expect((await res.json()).entries).toEqual([])
    await kyle.post("/api/auth/organization/set-active", {
      organizationId: home,
    })
    expect(await plan()).toMatchObject([{ id: meal.id, note: "Ours" }])
  })

  test("needs a key with the plan permission", async () => {
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
      `${TEST_ORIGIN}/api/plan?from=${week}&to=${addDays(week, 6)}`,
      { headers: { authorization: `Bearer ${key}` } }
    )
    expect(res.status).toBe(403)
  })
})

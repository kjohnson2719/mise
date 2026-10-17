import { addDays, clockIn, weekStartOf } from "@merran/shared"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../../app.ts"
import type { Database } from "../../../../database/orm.ts"
import { forHousehold } from "../../../../database/scope.ts"
import { suggestMeals } from "../../../../services/plan/suggest.ts"
import {
  account,
  createTestApp,
  inviteToken,
  join,
  setUpServer,
  TEST_ORIGIN,
  TestClient,
} from "../../../../test/app.ts"

// Fill the week: ideas for empty meals, by the household's tastes and theme
// nights, saying why. Next week's days, in a household on UTC whose week
// starts on Monday.

let app: App
let database: Database
let close: () => Promise<void>
let kyle: TestClient
let jamie: TestClient
let householdId: string
/** Next week's Monday. */
let monday: string
const ids: Record<string, string> = {}

type Idea = {
  date: string
  meal: string
  recipe: { id: string; name: string }
  withRecipe: { name: string } | null
  why: { kind: string; label?: string }[]
}

const day = (offset: number) => addDays(monday, offset)
const dinners = (...offsets: number[]) =>
  offsets.map((offset) => ({ date: day(offset), meal: "dinner" }))

async function suggest(
  slots: { date: string; meal: string }[],
  exclude?: string[]
): Promise<Idea[]> {
  const res = await kyle.post("/api/plan/suggest", { slots, exclude })
  expect(res.status, await res.clone().text()).toBe(200)
  return (await res.json()).suggestions
}

const names = (ideas: Idea[]) => ideas.map((idea) => idea.recipe.name)

async function setTastes(tastes: Record<string, unknown>) {
  const res = await kyle.put("/api/households/current/tastes", {
    avoid: [],
    diets: [],
    weeknightMinutes: null,
    ...tastes,
  })
  expect(res.status, await res.clone().text()).toBe(200)
  return res.json()
}

const NO_THEMES = [null, null, null, null, null, null, null]

async function setThemes(themes: unknown[]) {
  const res = await kyle.put("/api/households/current/themes", { themes })
  expect(res.status, await res.clone().text()).toBe(200)
  return res.json()
}

const RECIPES = [
  {
    name: "Chicken Tacos",
    tags: ["taco"],
    ingredients: ["1 lb chicken thighs", "8 corn tortillas"],
    totalMinutes: 30,
    rating: 5,
  },
  {
    name: "Lemon Chicken",
    ingredients: ["4 chicken thighs", "1 lemon"],
    totalMinutes: 50,
    rating: 4,
  },
  {
    name: "Mushroom Risotto",
    ingredients: ["8 oz mushrooms", "1 cup arborio rice"],
    totalMinutes: 40,
  },
  {
    name: "Pesto Pasta",
    ingredients: ["1/2 cup pesto", "1 lb spaghetti"],
    totalMinutes: 20,
  },
  {
    name: "Beef Stew",
    ingredients: ["2 lb beef chuck", "4 carrots"],
    totalMinutes: 150,
  },
  { name: "Pancakes", tags: ["breakfast"], ingredients: ["1 cup flour"] },
  { name: "Garlic Sauce", tags: ["sauce"], ingredients: ["4 cloves garlic"] },
  { name: "Garlic Rice", ingredients: ["1 cup rice", "2 cloves garlic"] },
]

/** The dinners there are to suggest: no breakfasts, sauces or sides. */
const DINNERS = [
  "Chicken Tacos",
  "Lemon Chicken",
  "Mushroom Risotto",
  "Pesto Pasta",
  "Beef Stew",
]

beforeAll(async () => {
  const test = await createTestApp()
  ;({ app, database, close } = test)
  kyle = await setUpServer(app, test.setupCode)
  householdId = (
    await (
      await kyle.patch("/api/households/current", {
        timeZone: "UTC",
        weekStartsOn: 1,
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
    expect(res.status, await res.clone().text()).toBe(201)
    ids[recipe.name] = (await res.json()).id
  }
  // Rice goes with lemon chicken, which makes it a side.
  await kyle.post("/api/recipes/lemon-chicken/pairings", {
    recipes: [ids["Garlic Rice"]],
  })
  jamie = await join(app, await inviteToken(kyle), account("jamie", "Jamie"))
})

afterAll(() => close())

describe("suggestions", () => {
  test("are a different dinner for each slot, never a sauce or side", async () => {
    const ideas = await suggest(dinners(0, 1, 2, 3))
    expect(ideas.map((idea) => idea.date)).toEqual([
      day(0),
      day(1),
      day(2),
      day(3),
    ])
    expect(new Set(names(ideas)).size).toBe(4)
    for (const name of names(ideas)) expect(DINNERS).toContain(name)
    for (const idea of ideas) expect(Array.isArray(idea.why)).toBe(true)
  })

  test("leave a slot out when nothing's left to suggest", async () => {
    const ideas = await suggest(dinners(0, 1, 2, 3, 4, 5, 6))
    expect(ideas).toHaveLength(DINNERS.length)
  })

  test("for breakfast, are breakfast recipes", async () => {
    expect(names(await suggest([{ date: day(0), meal: "breakfast" }]))).toEqual(
      ["Pancakes"]
    )
  })

  test("pair a side that goes with it", async () => {
    const others = DINNERS.filter((name) => name !== "Lemon Chicken")
    const [idea] = await suggest(
      dinners(0),
      others.map((name) => ids[name]!)
    )
    expect(idea).toMatchObject({
      recipe: { name: "Lemon Chicken" },
      withRecipe: { name: "Garlic Rice" },
      // Never made, and rated 4 stars.
      why: [{ kind: "new" }, { kind: "rated", stars: 4 }],
    })
  })

  test("leave out what's planned within two weeks, and what's passed over", async () => {
    const planned = await kyle.post("/api/plan/entries", {
      date: day(10),
      meal: "dinner",
      recipe: ids["Chicken Tacos"],
    })
    const ideas = await suggest(dinners(0, 1, 2, 3, 4, 5, 6), [
      ids["Beef Stew"]!,
    ])
    expect(names(ideas).sort()).toEqual(
      ["Lemon Chicken", "Mushroom Risotto", "Pesto Pasta"].sort()
    )
    await kyle.delete(`/api/plan/entries/${(await planned.json()).id}`)
  })

  test("are the same for the same luck", async () => {
    const seeded = (seed: number) => () => {
      seed = (seed * 16807) % 2147483647
      return (seed - 1) / 2147483646
    }
    const em = forHousehold(database.em.fork(), householdId)
    const slots = dinners(0, 1, 2) as { date: string; meal: "dinner" }[]
    const first = await suggestMeals(em, householdId, slots, {
      random: seeded(42),
    })
    const again = await suggestMeals(em, householdId, slots, {
      random: seeded(42),
    })
    expect(first).toHaveLength(3)
    expect(again).toEqual(first)
  })
})

describe("tastes", () => {
  test("start empty, and anyone in the household can change them", async () => {
    expect(
      await (await jamie.get("/api/households/current/tastes")).json()
    ).toEqual({ avoid: [], diets: [], weeknightMinutes: null })
    const res = await jamie.put("/api/households/current/tastes", {
      avoid: [
        { food: " Mushrooms ", level: "leave-out", who: " Emma " },
        { food: "mushrooms", level: "allergy" },
        { food: "nuts", level: "allergy", who: "" },
        // Dairy's in too much to leave out.
        { food: "dairy", level: "leave-out", who: "Sam" },
      ],
      diets: ["vegetarian", "vegetarian"],
      weeknightMinutes: 45,
    })
    // A food once, the firmest saying, and who it's for kept.
    expect(await res.json()).toEqual({
      avoid: [
        { food: "mushrooms", level: "allergy", who: "Emma" },
        { food: "nuts", level: "allergy", who: null },
        { food: "dairy", level: "never", who: "Sam" },
      ],
      diets: ["vegetarian"],
      weeknightMinutes: 45,
    })
    await setTastes({})
  })

  test("rule out foods to avoid, and long weeknight dinners", async () => {
    await setTastes({
      avoid: [
        { food: "mushroom", level: "never", who: null },
        // Pesto has nuts.
        { food: "nuts", level: "allergy", who: null },
      ],
      weeknightMinutes: 45,
    })
    const ideas = await suggest(dinners(0, 1, 2, 3, 4, 5, 6))
    expect(names(ideas)).not.toContain("Mushroom Risotto")
    expect(names(ideas)).not.toContain("Pesto Pasta")
    const stew = ideas.find((idea) => idea.recipe.name === "Beef Stew")
    // Friday to Sunday only.
    if (stew) expect([day(4), day(5), day(6)]).toContain(stew.date)
    expect(ideas.length).toBeGreaterThan(0)
    await setTastes({})
  })

  test("keep every meal to the household's diets", async () => {
    await setTastes({ diets: ["vegetarian"] })
    const ideas = await suggest(dinners(0, 1, 2, 3))
    expect(ideas.length).toBeGreaterThan(0)
    for (const name of names(ideas)) {
      expect(["Mushroom Risotto", "Pesto Pasta"]).toContain(name)
    }
    await setTastes({})
  })

  test("keep a recipe Merran can't read from a household with allergies", async () => {
    // Pistachio baklava, kept in Arabic: its nuts can't be seen.
    const res = await kyle.post("/api/recipes", {
      name: "بقلاوة بالفستق",
      servings: 12,
      ingredients: [
        "250 غرام فستق حلبي مطحون",
        "200 غرام زبدة مذابة",
        "1 كوب سكر",
      ],
      steps: ["اخبزها حتى تصبح ذهبية."],
    })
    expect(res.status, await res.clone().text()).toBe(201)
    const baklava = await res.json()
    const week = dinners(0, 1, 2, 3, 4, 5, 6)
    expect(names(await suggest(week))).toContain(baklava.name)

    await setTastes({
      avoid: [{ food: "peanuts", level: "allergy", who: "Emma" }],
    })
    // Every other dinner can be read, and has no peanuts.
    expect(names(await suggest(week)).sort()).toEqual([...DINNERS].sort())
    // A dislike only counts where it's found.
    await setTastes({ avoid: [{ food: "olives", level: "never", who: null }] })
    expect(names(await suggest(week))).toContain(baklava.name)

    await setTastes({})
    await kyle.delete(`/api/recipes/${baklava.id}`)
  })

  test("are checked", async () => {
    const put = (body: unknown) =>
      kyle.put("/api/households/current/tastes", body)
    expect(
      (
        await put({
          avoid: [{ food: "", level: "never" }],
          diets: [],
          weeknightMinutes: null,
        })
      ).status
    ).toBe(400)
    expect(
      (await put({ avoid: [], diets: ["keto"], weeknightMinutes: null })).status
    ).toBe(400)
    expect(
      (
        await put({
          avoid: [{ food: "olives", level: "sometimes" }],
          diets: [],
          weeknightMinutes: null,
        })
      ).status
    ).toBe(400)
    expect(
      (await put({ avoid: [], diets: [], weeknightMinutes: 5 })).status
    ).toBe(400)
  })
})

describe("theme nights", () => {
  test("are none at first, and set by household admins only", async () => {
    expect(
      await (await jamie.get("/api/households/current/themes")).json()
    ).toEqual({ themes: NO_THEMES })
    const res = await jamie.put("/api/households/current/themes", {
      themes: NO_THEMES,
    })
    expect(res.status).toBe(403)
  })

  test("keep a tag theme's tag, and only a tag theme's", async () => {
    const saved = await setThemes([
      null,
      { kind: "fish", name: "Fish", tag: "salmon" },
      { kind: "tag", name: " Tacos ", tag: " Taco " },
      null,
      null,
      null,
      null,
    ])
    expect(saved.themes.slice(1, 3)).toEqual([
      { kind: "fish", name: "Fish" },
      { kind: "tag", name: "Tacos", tag: "taco" },
    ])
    const put = (themes: unknown) =>
      kyle.put("/api/households/current/themes", { themes })
    expect((await put([null, null])).status).toBe(400)
    expect(
      (await put([{ kind: "tag", name: "Tacos" }, ...NO_THEMES.slice(1)]))
        .status
    ).toBe(400)
    await setThemes(NO_THEMES)
  })

  test("come first, saying so, or say nothing fits", async () => {
    // Monday plain, Tuesday tacos, Wednesday fish, Sunday out.
    await setThemes([
      { kind: "skip", name: "Eat out" },
      null,
      { kind: "tag", name: "Tacos", tag: "taco" },
      { kind: "fish", name: "Fish" },
      null,
      null,
      null,
    ])
    // Monday can't take Tuesday's tacos, however the luck falls.
    for (let i = 0; i < 5; i++) {
      const [mon, tue, wed] = await suggest(dinners(0, 1, 2, 6))
      expect(tue).toMatchObject({
        date: day(1),
        recipe: { name: "Chicken Tacos" },
      })
      expect(tue!.why[0]).toEqual({ kind: "theme", label: "Taco night" })
      expect(mon!.recipe.name).not.toBe("Chicken Tacos")
      expect(mon!.why.map((reason) => reason.kind)).not.toContain("theme")
      expect(wed!.why[0]).toEqual({ kind: "themeMissed", label: "Fish night" })
    }
    // Nothing for eating out.
    expect(await suggest(dinners(6))).toEqual([])
    // Themes are for dinner.
    expect(names(await suggest([{ date: day(1), meal: "breakfast" }]))).toEqual(
      ["Pancakes"]
    )
    await setThemes(NO_THEMES)
  })
})

describe("several meals at once", () => {
  test("go on together, saying why, and something else says its own", async () => {
    const res = await kyle.post("/api/plan/entries/batch", {
      entries: [
        {
          date: day(0),
          meal: "dinner",
          recipe: ids["Lemon Chicken"],
          withRecipe: ids["Garlic Rice"],
          why: [{ kind: "rated", stars: 4 }],
        },
        { date: day(0), meal: "dinner", recipe: ids["Pesto Pasta"] },
      ],
    })
    expect(res.status, await res.clone().text()).toBe(201)
    const { entries } = await res.json()
    expect(entries).toMatchObject([
      {
        recipe: { name: "Lemon Chicken" },
        withRecipe: { name: "Garlic Rice" },
        position: 0,
        why: [{ kind: "rated", stars: 4 }],
      },
      { recipe: { name: "Pesto Pasta" }, position: 1, why: [] },
    ])

    // Something else: a new recipe, its side kept, saying why.
    const swapped = await kyle.patch(`/api/plan/entries/${entries[0].id}`, {
      recipe: ids["Beef Stew"],
      why: [{ kind: "new" }],
    })
    expect(await swapped.json()).toMatchObject({
      recipe: { name: "Beef Stew" },
      withRecipe: { name: "Garlic Rice" },
      why: [{ kind: "new" }],
    })
    // A note isn't picked, so says no why.
    const noted = await kyle.patch(`/api/plan/entries/${entries[0].id}`, {
      note: "Leftovers",
    })
    expect((await noted.json()).why).toEqual([])

    await kyle.post("/api/plan/entries/bulk", {
      ids: entries.map((entry: { id: string }) => entry.id),
      action: "remove",
    })
  })

  test("go on all together or not at all", async () => {
    const res = await kyle.post("/api/plan/entries/batch", {
      entries: [
        { date: day(0), meal: "dinner", recipe: ids["Lemon Chicken"] },
        { date: day(1), meal: "dinner", recipe: "no-such-recipe" },
      ],
    })
    expect(res.status).toBe(404)
    const plan = await (
      await kyle.get(`/api/plan?from=${day(0)}&to=${day(6)}`)
    ).json()
    expect(plan.entries).toEqual([])
  })
})

describe("Fill the week", () => {
  test("needs a key that may plan, and admins' own sign-in for theme nights", async () => {
    const key = (
      await (
        await kyle.post("/api/auth/api-keys", {
          name: "Home Assistant",
          permissions: { plan: "read" },
          expiresInDays: 30,
        })
      ).json()
    ).key
    const call = (method: string, path: string, body?: unknown) =>
      app.request(`${TEST_ORIGIN}/api${path}`, {
        method,
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    expect(
      (await call("POST", "/plan/suggest", { slots: dinners(0) })).status
    ).toBe(200)
    expect((await call("GET", "/households/current/tastes")).status).toBe(200)
    expect((await call("GET", "/households/current/themes")).status).toBe(200)
    expect(
      (
        await call("PUT", "/households/current/tastes", {
          avoid: [],
          diets: [],
          weeknightMinutes: null,
        })
      ).status
    ).toBe(403)
    expect(
      (
        await call("POST", "/plan/entries/batch", {
          entries: [{ date: day(0), meal: "dinner", recipe: ids["Beef Stew"] }],
        })
      ).status
    ).toBe(403)
    expect(
      (await call("PUT", "/households/current/themes", { themes: NO_THEMES }))
        .status
    ).toBe(403)
  })

  test("is the household's own: its recipes, tastes and theme nights", async () => {
    await setTastes({ weeknightMinutes: 30 })
    await setThemes([{ kind: "skip", name: "Eat out" }, ...NO_THEMES.slice(1)])
    // Making a household switches the server admin to it.
    await kyle.post("/api/households", { name: "Cabin" })
    expect(await suggest(dinners(0, 1, 2))).toEqual([])
    expect(
      await (await kyle.get("/api/households/current/tastes")).json()
    ).toEqual({ avoid: [], diets: [], weeknightMinutes: null })
    expect(
      await (await kyle.get("/api/households/current/themes")).json()
    ).toEqual({ themes: NO_THEMES })
    await kyle.post("/api/auth/organization/set-active", {
      organizationId: householdId,
    })
    expect(
      (await (await kyle.get("/api/households/current/tastes")).json())
        .weeknightMinutes
    ).toBe(30)
    await setTastes({})
    await setThemes(NO_THEMES)
  })
})

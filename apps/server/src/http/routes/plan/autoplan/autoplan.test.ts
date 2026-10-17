import {
  addDays,
  autoplanWeek,
  clockIn,
  dayOfWeek,
  daysBetween,
  nextAutoplanRun,
  weekStartOf,
} from "@merran/shared"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../../app.ts"
import { Household, Job } from "../../../../database/entities/index.ts"
import type { Database } from "../../../../database/orm.ts"
import { forHousehold } from "../../../../database/scope.ts"
import { AUTOPLAN_JOB } from "../../../../services/plan/autoplan.ts"
import type { JobRunner } from "../../../../services/jobs/runner.ts"
import {
  createTestApp,
  setUpServer,
  TEST_ORIGIN,
  TestClient,
} from "../../../../test/app.ts"

// The weekly autoplan, in a household on UTC whose week starts on Monday.

let app: App
let database: Database
let jobs: JobRunner
let close: () => Promise<void>
let kyle: TestClient
let householdId: string
let today: string
/** The week a run today plans: the next to start today or later. */
let ahead: string

const DINNERS = [
  ["Lemon Chicken", ["2 lb chicken thighs", "2 lemons"]],
  ["Beef Tacos", ["1 lb ground beef", "8 tortillas"]],
  ["Mushroom Risotto", ["1 cup arborio rice", "8 oz mushrooms"]],
  ["Salmon Bake", ["4 salmon fillets", "1 lemon"]],
  ["Veggie Curry", ["1 can chickpeas", "1 can coconut milk"]],
  ["Pork Chops", ["4 pork chops", "2 apples"]],
  ["Shrimp Pasta", ["1 lb shrimp", "1 lb spaghetti"]],
  ["Turkey Chili", ["1 lb ground turkey", "1 can kidney beans"]],
  ["Egg Fried Rice", ["4 eggs", "2 cups rice"]],
] as const

const settings = {
  enabled: true,
  day: 6,
  hour: 9,
  meals: ["dinner"],
  addToList: true,
}

async function autoplan() {
  const res = await kyle.get("/api/plan/autoplan")
  expect(res.status).toBe(200)
  return res.json()
}

async function save(change: Record<string, unknown>) {
  const res = await kyle.put("/api/plan/autoplan", { ...settings, ...change })
  expect(res.status, await res.clone().text()).toBe(200)
  return res.json()
}

const waiting = () =>
  forHousehold(database.em.fork(), householdId).find(Job, {
    kind: AUTOPLAN_JOB,
    forHousehold: householdId,
    status: "queued",
  })

async function week(from = ahead) {
  const res = await kyle.get(`/api/plan?from=${from}&to=${addDays(from, 6)}`)
  return (await res.json()).entries as {
    id: string
    date: string
    meal: string
    recipe: { name: string } | null
    why: unknown[] | null
  }[]
}

/** As if the autoplan's time had come today, for a week it hasn't planned. */
async function timeComes() {
  const em = forHousehold(database.em.fork(), householdId)
  const household = await em.findOneOrFail(Household, { id: householdId })
  household.settings = {
    ...household.settings,
    autoplan: { ...household.settings!.autoplan!, last: null },
  }
  await em.flush()
  await hurry(today)
}

/**
 * Runs the waiting run now, or as if it was meant for another day. Today's
 * plans the week ahead; the one waiting, next Saturday's, plans the week
 * after it from Saturday at 9 through Monday. Under a key of its own: a
 * real run's next is a week on, but one hurried would come round to the
 * same time and key.
 */
async function hurry(meantFor?: string) {
  const em = forHousehold(database.em.fork(), householdId)
  for (const job of await em.find(Job, {
    kind: AUTOPLAN_JOB,
    forHousehold: householdId,
    status: "queued",
  })) {
    job.runAt = new Date(Date.now() - 1000)
    job.key = `${job.key}:now`
    if (meantFor) job.payload = { at: `${meantFor}T09:00:00.000Z` }
  }
  await em.flush()
  await jobs.drain()
}

/** What the last run said. */
const lastResult = async () =>
  (
    await forHousehold(database.em.fork(), householdId).find(
      Job,
      { kind: AUTOPLAN_JOB, status: "done" },
      { orderBy: { createdAt: "desc" }, limit: 1 }
    )
  )[0]?.result

async function clearAll() {
  const entries = await week(addDays(ahead, -7))
  const more = await week()
  const ids = [...entries, ...more].map((entry) => entry.id)
  if (ids.length > 0)
    await kyle.post("/api/plan/entries/bulk", { ids, action: "remove" })
  await kyle.post("/api/list/clear", { which: "all" })
}

beforeAll(async () => {
  const test = await createTestApp()
  ;({ app, database, jobs, close } = test)
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
  ahead = autoplanWeek(today, 1)
  for (const [name, ingredients] of DINNERS) {
    const res = await kyle.post("/api/recipes", {
      name,
      servings: 4,
      ingredients,
      steps: ["Cook it."],
    })
    expect(res.status, await res.clone().text()).toBe(201)
  }
})

afterAll(() => close())

describe("the autoplan", () => {
  test("is off to start: Saturday at 9, dinners, onto the list", async () => {
    expect(await autoplan()).toEqual({
      enabled: false,
      day: 6,
      hour: 9,
      meals: ["dinner"],
      addToList: true,
      next: null,
      last: null,
    })
    expect(await waiting()).toEqual([])
  })

  test("waits for its day and hour once it's on", async () => {
    const saved = await save({})
    const next = nextAutoplanRun(settings, "UTC")
    expect(saved).toMatchObject({ enabled: true, next: next.toISOString() })
    expect((await waiting()).map((job) => job.runAt)).toEqual([next])

    // Another day: the run moves, and only one waits.
    const sunday = await save({ day: 0, hour: 18 })
    expect(sunday.next).toBe(
      nextAutoplanRun({ day: 0, hour: 18 }, "UTC").toISOString()
    )
    expect(await waiting()).toHaveLength(1)

    // Off: nothing waits.
    expect(await save({ enabled: false })).toMatchObject({ next: null })
    expect(await waiting()).toEqual([])
    // And runs that never started aren't kept, cancelled, on the Jobs page.
    expect(
      await forHousehold(database.em.fork(), householdId).count(Job, {
        kind: AUTOPLAN_JOB,
      })
    ).toBe(0)
  })

  test("in the household's time zone", async () => {
    await kyle.patch("/api/households/current", { timeZone: "America/Chicago" })
    try {
      const saved = await save({})
      expect(saved.next).toBe(
        nextAutoplanRun(settings, "America/Chicago").toISOString()
      )
    } finally {
      await kyle.patch("/api/households/current", { timeZone: "UTC" })
      await save({ enabled: false })
    }
  })

  test("plans nothing when it's turned on, only when its time comes", async () => {
    await save({})
    expect(await week()).toEqual([])
    expect((await autoplan()).last).toBeNull()
    await save({ enabled: false })
  })

  test("running late, plans what's left of its week, and nothing once it's gone by", async () => {
    const thisMonday = weekStartOf(today, 1)
    await save({})
    // Meant for last Sunday, with the server off since: this week, from today.
    await hurry(addDays(thisMonday, -1))
    const dates = (await week(thisMonday)).map((entry) => entry.date).sort()
    expect(dates).toEqual(
      Array.from(
        { length: daysBetween(today, addDays(thisMonday, 6)) + 1 },
        (_, index) => addDays(today, index)
      )
    )
    expect((await autoplan()).last).toMatchObject({ week: thisMonday })
    // Meant for a week that's over: nothing.
    await hurry(addDays(thisMonday, -8))
    expect(await lastResult()).toEqual({ skipped: "gone by" })
    expect(await waiting()).toHaveLength(1)
    await save({ enabled: false })
    await clearAll()
  })

  test("plans the week ahead's dinners when its time comes, saying why", async () => {
    await save({})
    await timeComes()
    const entries = await week()
    expect(entries).toHaveLength(7)
    expect(entries.every((entry) => entry.meal === "dinner")).toBe(true)
    expect(entries.every((entry) => (entry.why ?? []).length > 0)).toBe(true)
    expect(new Set(entries.map((entry) => entry.recipe?.name)).size).toBe(7)

    const now = await autoplan()
    // Only what it says, none of what it keeps to itself.
    expect(Object.keys(now).sort()).toEqual(
      ["addToList", "day", "enabled", "hour", "last", "meals", "next"].sort()
    )
    const { last, next } = now
    expect(last).toMatchObject({ week: ahead, planned: 7, empty: 7 })
    expect(last.listed).toBeGreaterThan(0)
    // What they need is on the list.
    const list = (await (await kyle.get("/api/list")).json()).items
    expect(list.length).toBe(last.listed)
    // Next week's run waits.
    expect(new Date(next).getTime()).toBeGreaterThan(Date.now())
    expect(await waiting()).toHaveLength(1)

    // Its time again, the same week: planned already.
    await hurry(today)
    expect(await lastResult()).toEqual({ skipped: "planned already" })
    expect(await week()).toHaveLength(7)
    await save({ enabled: false })
    await clearAll()
  })

  test("fills only what's empty, leaving eat-out nights, and can leave the list be", async () => {
    // Friday's eat-out night; Monday's planned already.
    const themes = Array.from({ length: 7 }, (_, weekday) =>
      weekday === 5 ? { kind: "skip", name: "Eat out" } : null
    )
    await kyle.put("/api/households/current/themes", { themes })
    await kyle.post("/api/plan/entries", {
      date: ahead,
      meal: "dinner",
      recipe: null,
      note: "Pizza",
    })
    await save({ addToList: false })
    await timeComes()
    const entries = await week()
    expect(entries).toHaveLength(6)
    const friday = entries.find((entry) => dayOfWeek(entry.date) === 5)
    expect(friday).toBeUndefined()
    expect(entries.filter((entry) => entry.date === ahead)).toHaveLength(1)
    expect((await autoplan()).last).toMatchObject({
      planned: 5,
      empty: 5,
      listed: 0,
    })
    expect((await (await kyle.get("/api/list")).json()).items).toEqual([])
    await kyle.put("/api/households/current/themes", {
      themes: Array(7).fill(null),
    })
    await save({ enabled: false, addToList: true })
    await clearAll()
  })

  test("plans the week ahead now, which then counts as planned", async () => {
    const res = await kyle.post("/api/plan/autoplan/run")
    expect(res.status, await res.clone().text()).toBe(200)
    expect(await res.json()).toMatchObject({
      week: ahead,
      planned: 7,
      empty: 7,
    })
    expect(await week()).toHaveLength(7)
    // Turned on, its time comes for that week: planned already.
    await save({})
    await hurry(today)
    expect((await autoplan()).last).toMatchObject({ week: ahead, planned: 7 })
    expect(await week()).toHaveLength(7)
    await save({ enabled: false })
    await clearAll()
  })

  test("is changed by household admins, and run with a key that writes the plan", async () => {
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
    const reader = await keyFor({ plan: "read" })
    expect((await call(reader, "GET", "/plan/autoplan")).status).toBe(200)
    expect((await call(reader, "POST", "/plan/autoplan/run")).status).toBe(403)
    const writer = await keyFor({ plan: "write" })
    expect((await call(writer, "PUT", "/plan/autoplan", settings)).status).toBe(
      403
    )
    expect((await call(writer, "POST", "/plan/autoplan/run")).status).toBe(200)
    await clearAll()
  })

  test("is the household's own", async () => {
    await save({})
    await kyle.post("/api/households", { name: "Cabin" })
    expect(await autoplan()).toMatchObject({ enabled: false, next: null })
    await kyle.post("/api/auth/organization/set-active", {
      organizationId: householdId,
    })
    expect(await autoplan()).toMatchObject({ enabled: true })
    await save({ enabled: false })
  })
})

import { addDays, clockIn, foodKey } from "@merran/shared"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../../app.ts"
import { Household, Purchase } from "../../../../database/entities/index.ts"
import type { Database } from "../../../../database/orm.ts"
import { forHousehold } from "../../../../database/scope.ts"
import {
  createTestApp,
  setUpServer,
  TEST_ORIGIN,
  TestClient,
} from "../../../../test/app.ts"

// Usual buys, in a US household on UTC, learned from what it's put away.

let app: App
let database: Database
let close: () => Promise<void>
let kyle: TestClient
let householdId: string
let today: string

const ago = (days: number) => addDays(today, -days)

type Usual = {
  food: string
  name: string
  amount: string
  every: number
  lastBought: string
  dueOn: string
}

async function usual(): Promise<Usual[]> {
  const res = await kyle.get("/api/list/usual")
  expect(res.status).toBe(200)
  return (await res.json()).items
}

const foods = async () => (await usual()).map((buy) => buy.food)

/** Bought on each of the days given, so many days ago. */
async function bought(
  name: string,
  daysAgo: number[],
  amount: { quantity?: number; unit?: string; amountText?: string } = {}
) {
  const em = forHousehold(database.em.fork(), householdId)
  for (const days of daysAgo)
    em.create(Purchase, {
      household: householdId,
      foodKey: foodKey(name),
      name,
      quantity: amount.quantity ?? null,
      unit: amount.unit ?? null,
      amountText: amount.amountText ?? null,
      boughtOn: ago(days),
    })
  await em.flush()
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
  // Every six days, last eight days ago: due three days ago.
  await bought("milk", [20, 14, 8], { quantity: 1, unit: "gallon" })
  // Every week, last a week ago: due yesterday.
  await bought("eggs", [21, 14, 7], { amountText: "a dozen" })
  // Every ten days, last two days ago: not due yet.
  await bought("coffee", [22, 12, 2])
  // Bought twice isn't usual yet.
  await bought("saffron", [30, 2])
  // Always on hand.
  await bought("salt", [60, 40, 20])
})

afterAll(() => close())

describe("usual buys", () => {
  test("are what's due again, most overdue first", async () => {
    expect(await usual()).toEqual([
      {
        food: "milk",
        name: "milk",
        amount: "1 gal",
        every: 6,
        lastBought: ago(8),
        dueOn: ago(3),
      },
      {
        food: "egg",
        name: "eggs",
        amount: "a dozen",
        every: 7,
        lastBought: ago(7),
        dueOn: ago(1),
      },
    ])
  })

  test("leave out what's on the list, at home or bought every week", async () => {
    const res = await kyle.post("/api/list/items", { text: "milk" })
    expect(res.status, await res.clone().text()).toBe(201)
    expect(await foods()).toEqual(["egg"])
    await kyle.post("/api/list/clear", { which: "all" })

    await kyle.post("/api/pantry/items", { text: "6 eggs" })
    expect(await foods()).toEqual(["milk"])
    await kyle.post("/api/pantry/clear")

    const weekly = await (
      await kyle.post("/api/list/every-week", { name: "Milk" })
    ).json()
    expect(await foods()).toEqual(["egg"])
    await kyle.delete(`/api/list/every-week/${weekly.id}`)
    expect(await foods()).toEqual(["milk", "egg"])
  })

  test("can wait until they're next due", async () => {
    const res = await kyle.post("/api/list/usual/skip", { food: "milk" })
    expect(res.status).toBe(204)
    expect(await foods()).toEqual(["egg"])
    const household = await forHousehold(
      database.em.fork(),
      householdId
    ).findOneOrFail(Household, { id: householdId })
    expect(household.settings?.usualSkipped).toEqual({
      milk: addDays(today, 6),
    })
    // Offered again when that day comes.
    const em = forHousehold(database.em.fork(), householdId)
    const again = await em.findOneOrFail(Household, { id: householdId })
    again.settings = { ...again.settings, usualSkipped: { milk: today } }
    await em.flush()
    expect(await foods()).toEqual(["milk", "egg"])
  })

  test("go on the list as they were last bought, in their aisle", async () => {
    const res = await kyle.post("/api/list/usual/add", {
      foods: ["egg", "coffee"],
    })
    expect(res.status, await res.clone().text()).toBe(201)
    // Coffee isn't due, so it's passed over.
    const { items } = await res.json()
    expect(items).toMatchObject([
      { name: "eggs", amount: "a dozen", source: "usual" },
    ])
    expect(items[0].aisle).not.toBeNull()
    expect(await foods()).toEqual(["milk"])
    await kyle.post("/api/list/clear", { which: "all" })
  })

  test("need a key with the list's permission", async () => {
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
    const reader = await keyFor({ list: "read" })
    expect((await call(reader, "GET", "/list/usual")).status).toBe(200)
    expect(
      (await call(reader, "POST", "/list/usual/add", { foods: ["milk"] }))
        .status
    ).toBe(403)
    expect(
      (await call(reader, "POST", "/list/usual/skip", { food: "milk" })).status
    ).toBe(403)
  })

  test("are the household's own", async () => {
    await kyle.post("/api/households", { name: "Cabin" })
    expect(await usual()).toEqual([])
    await kyle.post("/api/auth/organization/set-active", {
      organizationId: householdId,
    })
    expect(await foods()).toEqual(["milk", "egg"])
  })
})

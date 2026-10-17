import { addDays, clockIn, weekStartOf } from "@merran/shared"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../../app.ts"
import {
  account,
  createTestApp,
  inviteToken,
  join,
  setUpServer,
  TEST_ORIGIN,
  TestClient,
} from "../../../../test/app.ts"

// Lists: a household in the US with a Costco list for meat, and the main
// list for everything else. Stores are chosen for each thing, not a list.

let app: App
let close: () => Promise<void>
let kyle: TestClient
let jamie: TestClient
let main: string
let aisles: Record<string, string> = {}

type List = {
  id: string
  name: string
  main: boolean
  aisles: string[]
}
type Item = { id: string; name: string; list: string; aisle: string | null }

const getList = async () =>
  (await (await kyle.get("/api/list")).json()) as {
    lists: List[]
    items: Item[]
  }

async function type(text: string, list?: string) {
  const res = await kyle.post("/api/list/items", { text, list })
  expect(res.status, await res.clone().text()).toBe(201)
  return (await res.json()) as Item
}

async function save(lists: unknown[]) {
  return kyle.put("/api/list/lists", { lists })
}

/** Splits off a Costco list for meat and seafood. */
async function splitOffCostco() {
  const res = await save([
    { id: main, name: "Groceries", aisles: [] },
    {
      name: "Costco",
      aisles: [aisles["Meat & seafood"]],
    },
  ])
  expect(res.status, await res.clone().text()).toBe(200)
  const { lists } = (await res.json()) as { lists: List[] }
  return lists.find((list) => list.name === "Costco")!.id
}

async function reset() {
  await kyle.post("/api/list/clear", { which: "all" })
  await save([{ id: main, name: "Shopping list", aisles: [] }])
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
  jamie = await join(app, await inviteToken(kyle), account("jamie", "Jamie"))
  const list = await (await kyle.get("/api/list")).json()
  main = list.lists[0].id
  aisles = Object.fromEntries(
    list.aisles.map((aisle: { id: string; name: string }) => [
      aisle.name,
      aisle.id,
    ])
  )
})

afterAll(() => close())

describe("lists", () => {
  test("start as one main list", async () => {
    expect((await getList()).lists).toEqual([
      { id: main, name: "Shopping list", main: true, aisles: [] },
    ])
  })

  test("take their aisles, and what's waiting on the main list goes there", async () => {
    const beef = await type("2 lb ground beef")
    const towels = await type("paper towels")
    const costco = await splitOffCostco()

    const { lists, items } = await getList()
    expect(lists).toMatchObject([
      { id: main, name: "Groceries", main: true },
      {
        id: costco,
        name: "Costco",
        main: false,
        aisles: [aisles["Meat & seafood"]],
      },
    ])
    const on = (id: string) => items.find((item) => item.id === id)?.list
    expect(on(beef.id)).toBe(costco)
    expect(on(towels.id)).toBe(main)
    // New ones too.
    expect((await type("1 lb chicken thighs")).list).toBe(costco)
    expect((await type("milk")).list).toBe(main)
    await reset()
  })

  test("remember a food moved to another list", async () => {
    const costco = await splitOffCostco()
    const towels = await type("paper towels")
    await kyle.patch(`/api/list/items/${towels.id}`, { list: costco })
    expect((await type("Paper towel")).list).toBe(costco)

    // Moving meat back to the main list says it goes there now.
    const beef = await type("ground beef")
    await kyle.post("/api/list/items/bulk", {
      ids: [beef.id],
      action: "move",
      list: main,
    })
    expect((await type("ground beef")).list).toBe(main)
    expect(
      (
        await kyle.post("/api/list/items/bulk", {
          ids: [beef.id],
          action: "move",
        })
      ).status
    ).toBe(400)
    await reset()
  })

  test("take typed things on the list they're added to", async () => {
    const costco = await splitOffCostco()
    expect((await type("batteries", costco)).list).toBe(costco)
    expect(
      (await kyle.post("/api/list/items", { text: "milk", list: "nope" }))
        .status
    ).toBe(404)
    await reset()
  })

  test("get the plan's meals by their aisles", async () => {
    const costco = await splitOffCostco()
    const recipe = await (
      await kyle.post("/api/recipes", {
        name: "Chicken Tacos",
        servings: 4,
        ingredients: ["1 lb chicken breasts", "8 corn tortillas"],
        steps: ["Cook it."],
      })
    ).json()
    const monday = addDays(weekStartOf(clockIn("UTC").today, 1), 7)
    await kyle.post("/api/plan/entries", {
      date: monday,
      meal: "dinner",
      recipe: recipe.id,
    })
    await kyle.post("/api/list/from-plan", {
      from: monday,
      to: addDays(monday, 6),
    })
    const items = (await getList()).items
    // Chicken: ground beef was moved to the main list before.
    expect(items.find((item) => item.name === "chicken breasts")?.list).toBe(
      costco
    )
    expect(items.find((item) => item.name === "corn tortillas")?.list).toBe(
      main
    )
    await reset()
  })

  test("going take what's on them to the main list", async () => {
    await splitOffCostco()
    const beef = await type("2 lb ground beef")
    const res = await save([{ id: main, name: "Groceries", aisles: [] }])
    expect((await res.json()).lists).toHaveLength(1)
    expect(
      (await getList()).items.find((item) => item.id === beef.id)?.list
    ).toBe(main)
    await reset()
  })

  test("are checked", async () => {
    const costco = await splitOffCostco()
    const check = async (lists: unknown[], status: number) =>
      expect((await save(lists)).status).toBe(status)
    const groceries = { id: main, name: "Groceries", aisles: [] }
    // The main list stays.
    await check([{ id: costco, name: "Costco", aisles: [] }], 400)
    // An aisle on one list.
    const meat = aisles["Meat & seafood"]
    await check(
      [
        groceries,
        { name: "Costco", aisles: [meat] },
        { name: "Butcher", aisles: [meat] },
      ],
      400
    )
    // Lists and aisles the household has.
    await check(
      [
        groceries,
        {
          id: "0199e8b0-5a10-7a01-8b00-000000000099",
          name: "X",
          aisles: [],
        },
      ],
      404
    )
    await check(
      [
        groceries,
        {
          name: "X",
          aisles: ["0199e8b0-5a10-7a01-8b00-000000000099"],
        },
      ],
      404
    )
    await check(
      [
        groceries,
        ...Array.from({ length: 10 }, (_, i) => ({
          name: `List ${i}`,
          aisles: [],
        })),
      ],
      400
    )
    await reset()
  })

  test("are set by household admins, signed in", async () => {
    expect(
      (
        await jamie.put("/api/list/lists", {
          lists: [{ id: main, name: "Mine", aisles: [] }],
        })
      ).status
    ).toBe(403)
    const key = (
      await (
        await kyle.post("/api/auth/api-keys", {
          name: "Home Assistant",
          permissions: { list: "write" },
          expiresInDays: 30,
        })
      ).json()
    ).key
    const res = await app.request(`${TEST_ORIGIN}/api/list/lists`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        lists: [{ id: main, name: "Mine", aisles: [] }],
      }),
    })
    expect(res.status).toBe(403)
  })

  test("keep an item's list through Undo", async () => {
    const costco = await splitOffCostco()
    const beef = await type("2 lb pork chops")
    const before = await (
      await kyle.delete(`/api/list/items/${beef.id}`)
    ).json()
    expect(before.list).toBe(costco)
    await kyle.post("/api/list/restore", { items: [before] })
    expect(
      (await getList()).items.find((item) => item.id === beef.id)?.list
    ).toBe(costco)
    await reset()
  })
})

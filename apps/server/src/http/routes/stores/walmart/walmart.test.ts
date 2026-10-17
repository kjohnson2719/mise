import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../../app.ts"
import { createTestApp, setUpServer, TestClient } from "../../../../test/app.ts"

// Walmart through Merran's browser extension: the extension searches and
// fills the cart in the person's own Walmart tab; the server only keeps
// what it found, Merran's picks and the household's own, and what was sent.
// No AI here, so Merran's pick is the first in stock.

let app: App
let close: () => Promise<void>
let kyle: TestClient

const product = (
  id: string,
  name: string,
  more: Record<string, unknown> = {}
) => ({
  id,
  upc: null,
  name,
  brand: "Great Value",
  size: "128 fl oz",
  image: `https://i5.walmartimages.com/${id}.jpg`,
  price: 327,
  salePrice: null,
  saleEnds: null,
  currency: "USD",
  aisle: null,
  inStock: true,
  url: `https://www.walmart.com/ip/${id}`,
  ...more,
})

type Line = {
  itemId: string
  name: string
  product: { id: string; price: number | null } | null
  suggested: boolean
  packages: number
  sure: boolean
  sent: boolean
}

const basket = async () => {
  const res = await kyle.get("/api/stores/walmart/basket")
  expect(res.status, await res.clone().text()).toBe(200)
  return (await res.json()) as {
    store: string
    cartUrl: string
    sentAt: string | null
    lines: Line[]
    toFind: { itemId: string; words: string }[]
  }
}

const line = async (name: string) =>
  (await basket()).lines.find((one) => one.name === name)!

beforeAll(async () => {
  const test = await createTestApp()
  ;({ app, close } = test)
  kyle = await setUpServer(app, test.setupCode)
  await kyle.patch("/api/households/current", { country: "US" })
})

afterAll(() => close())

describe("Walmart", () => {
  test("is off until the server admin turns it on", async () => {
    const res = await kyle.get("/api/stores/walmart/basket")
    expect(res.status).toBe(422)
    expect((await res.json()).error.code).toBe("walmart_off")
    const before = await (await kyle.get("/api/capabilities")).json()
    expect(before.capabilities).not.toContain("stores.walmart")

    const on = await kyle.patch("/api/settings/server", {
      "stores.walmart": true,
    })
    expect(on.status, await on.clone().text()).toBe(200)
    const after = await (await kyle.get("/api/capabilities")).json()
    expect(after.capabilities).toContain("stores.walmart")
    // Kroger is its own: still off without an app.
    expect(after.capabilities).not.toContain("stores.kroger")
  })

  test("says what to find, each food once, by the food as it's bought", async () => {
    await kyle.post("/api/list/items", { text: "1 gallon milk" })
    await kyle.post("/api/list/items", { text: "Pinch of salt" })
    await kyle.post("/api/list/items", { text: "2 cups milk" })
    const { store, cartUrl, lines, toFind } = await basket()
    expect(store).toBe("Walmart")
    expect(cartUrl).toBe("https://www.walmart.com/cart")
    expect(lines.map((one) => one.product)).toEqual([null, null, null])
    expect(toFind.map((one) => one.words)).toEqual(["milk", "salt"])
  })

  test("keeps Merran's pick from what was found, and every price", async () => {
    const { toFind } = await basket()
    const milk = toFind.find((one) => one.words === "milk")!
    const res = await kyle.post("/api/stores/walmart/found", {
      items: [
        {
          itemId: milk.itemId,
          products: [
            product("1", "Whole Milk, 1 Gallon", { inStock: false }),
            product("2", "Great Value Whole Milk, Gallon, 128 fl oz"),
          ],
        },
      ],
    })
    expect(res.status, await res.clone().text()).toBe(200)
    const after = await res.json()
    // Both milk lines are the one food.
    expect(
      after.lines
        .filter((one: Line) => /milk/.test(one.name))
        .map((one: Line) => [one.product?.id, one.suggested])
    ).toEqual([
      ["2", true],
      ["2", true],
    ])
    expect(await line("milk")).toMatchObject({ packages: 1, sure: true })
    expect(after.toFind.map((one: { words: string }) => one.words)).toEqual([
      "salt",
    ])
  })

  test("keeps what Walmart had for each food, to pick another from", async () => {
    const lines = (await basket()).lines.filter((one) => /milk/.test(one.name))
    for (const milk of lines) {
      const res = await kyle.get(`/api/stores/walmart/products/${milk.itemId}`)
      expect(res.status, await res.clone().text()).toBe(200)
      expect(
        (await res.json()).products.map((one: { id: string }) => one.id)
      ).toEqual(["1", "2"])
    }
    // Not looked for yet: nothing to pick from.
    const salt = (await basket()).lines.find((one) => /salt/.test(one.name))!
    const none = await kyle.get(`/api/stores/walmart/products/${salt.itemId}`)
    expect((await none.json()).products).toEqual([])
  })

  test("keeps a person's pick over Merran's, brought up to date when found", async () => {
    const milk = await line("milk")
    const picked = await kyle.put(
      `/api/stores/walmart/products/${milk.itemId}`,
      {
        product: product("3", "Organic Whole Milk, Half Gallon, 64 fl oz", {
          size: "64 fl oz",
        }),
      }
    )
    expect(picked.status, await picked.clone().text()).toBe(200)
    expect(await picked.json()).toMatchObject({
      product: { id: "3" },
      suggested: false,
      packages: 2,
    })
    // Found again: still the household's, at today's price.
    await kyle.post("/api/stores/walmart/found", {
      items: [
        {
          itemId: milk.itemId,
          products: [
            product("2", "Great Value Whole Milk, Gallon, 128 fl oz"),
            product("3", "Organic Whole Milk, Half Gallon, 64 fl oz", {
              size: "64 fl oz",
              price: 499,
            }),
          ],
        },
      ],
    })
    expect(await line("milk")).toMatchObject({
      product: { id: "3", price: 499 },
      suggested: false,
    })
  })

  test("remembers what went in the cart, at its page's price", async () => {
    const milk = await line("milk")
    const res = await kyle.post("/api/stores/walmart/sent", {
      lines: [
        {
          itemId: milk.itemId,
          packages: 3,
          product: product("3", "Organic Whole Milk, Half Gallon, 64 fl oz", {
            size: "64 fl oz",
            price: 479,
          }),
        },
      ],
    })
    expect(res.status, await res.clone().text()).toBe(200)
    expect(await res.json()).toEqual({
      sent: 1,
      store: "Walmart",
      cartUrl: "https://www.walmart.com/cart",
    })
    const after = await basket()
    expect(after.sentAt).not.toBeNull()
    expect(after.lines.find((one) => one.itemId === milk.itemId)).toMatchObject(
      {
        sent: true,
        packages: 3,
        product: { id: "3", price: 479 },
      }
    )
  })

  test("sends just the list being looked at, when it's asked for", async () => {
    const { lists } = (await (await kyle.get("/api/list")).json()) as {
      lists: { id: string; name: string }[]
    }
    // Named for the store, but not set to it: a list for no store.
    const saved = await kyle.put("/api/list/lists", {
      lists: [
        { id: lists[0]!.id, name: lists[0]!.name, store: null, aisles: [] },
        { name: "Walmart", store: null, aisles: [] },
      ],
    })
    expect(saved.status, await saved.clone().text()).toBe(200)
    const walmartList = (
      (await saved.json()) as { lists: { id: string; name: string }[] }
    ).lists.find((one) => one.name === "Walmart")!
    await kyle.post("/api/list/items", {
      text: "paper towels",
      list: walmartList.id,
    })

    // Without a list: every list for no store, both of them.
    const names = (await basket()).lines.map((one) => one.name)
    expect(names.some((name) => /paper towel/.test(name))).toBe(true)
    expect(names.some((name) => /milk/.test(name))).toBe(true)

    // The list being looked at: just its own.
    const res = await kyle.get(
      `/api/stores/walmart/basket?list=${walmartList.id}`
    )
    expect(res.status, await res.clone().text()).toBe(200)
    const one = (await res.json()) as Awaited<ReturnType<typeof basket>>
    expect(one.lines).toHaveLength(1)
    expect(one.lines[0]!.name).toMatch(/paper towel/)
    expect(one.toFind.map((thing) => thing.words)).toHaveLength(1)

    const none = await kyle.get(
      "/api/stores/walmart/basket?list=0199e8b0-5a10-7a01-8b00-000000000000"
    )
    expect(none.status).toBe(404)
    const nonsense = await kyle.get("/api/stores/walmart/basket?list=nope")
    expect(nonsense.status).toBe(400)
  })

  test("takes only Walmart's own pages from the extension", async () => {
    const { lines } = await basket()
    const res = await kyle.put(
      `/api/stores/walmart/products/${lines[0]!.itemId}`,
      {
        product: product("4", "Milk", { url: "https://example.com/ip/4" }),
      }
    )
    expect(res.status).toBe(400)
    const bad = await kyle.put(
      `/api/stores/walmart/products/${lines[0]!.itemId}`,
      { product: product("4", "Milk", { image: "javascript:alert(1)" }) }
    )
    expect(bad.status).toBe(400)
  })
})

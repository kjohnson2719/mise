import { createHash } from "node:crypto"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../app.ts"
import { addDays } from "@merran/shared"
import {
  Job,
  Secret,
  StoreConnection,
  StorePrice,
} from "../../../database/entities/index.ts"
import type { Database } from "../../../database/orm.ts"
import { ACROSS_HOUSEHOLDS, forHousehold } from "../../../database/scope.ts"
import type {
  FetchOptions,
  Fetcher,
} from "../../../services/fetch/public-fetch.ts"
import { suggestMeals } from "../../../services/plan/suggest.ts"
import type { Settings } from "../../../services/settings/settings.ts"
import { budgetForSuggest } from "../../../services/stores/costs.ts"
import {
  priceCheckDue,
  salesForSuggest,
} from "../../../services/stores/prices.ts"
import {
  account,
  createTestApp,
  inviteToken,
  join,
  setUpServer,
  TEST_ORIGIN,
  type TestClient,
} from "../../../test/app.ts"

// Kroger: the server admin's developer app, a household's store and the
// account it links, and the list sent to that account's cart. Kroger here
// is a fake: it knows two Fry's stores in Phoenix and a few products, and
// keeps what was added to the cart.

const CLIENT_ID = "merran-test"
const CLIENT_SECRET = "kroger-test-secret"
const KROGER = "https://api.kroger.com/v1"

type FakeProduct = {
  productId: string
  upc: string
  description: string
  brand: string
  size: string
  regular: number
  promo?: number
  until?: string
  out?: boolean
  categories?: string[]
}

const PRODUCTS: Record<string, FakeProduct[]> = {
  milk: [
    {
      productId: "milk1",
      upc: "0001111041700",
      description: "Kroger 2% Reduced Fat Milk",
      brand: "Kroger",
      size: "1 gal",
      regular: 3.49,
      promo: 2.99,
      until: "2099-10-21T00:00:00Z",
    },
  ],
  eggs: [
    {
      productId: "eggs1",
      upc: "0001111060903",
      description: "Kroger Grade A Large Eggs",
      brand: "Kroger",
      size: "12 ct",
      regular: 2.79,
      out: true,
    },
    {
      productId: "eggs2",
      upc: "0001111060904",
      description: "Simple Truth Large Brown Eggs",
      brand: "Simple Truth",
      size: "12 ct",
      regular: 4.49,
    },
    {
      productId: "eggs3",
      upc: "0001111060905",
      description: "Kroger Large Eggs 18 Count",
      brand: "Kroger",
      size: "18 ct",
      regular: 3.99,
    },
  ],
  salt: [
    {
      productId: "salt1",
      upc: "0002460001001",
      description: "Morton Iodized Salt",
      brand: "Morton",
      size: "26 oz",
      regular: 1.29,
    },
  ],
  "chicken thighs": [
    {
      productId: "chicken1",
      upc: "0020000000002",
      description: "Kroger Boneless Skinless Chicken Thighs",
      brand: "Kroger",
      size: "1 lb",
      regular: 5.99,
      promo: 3.99,
    },
  ],
  // A search for tomatoes finds a lipstick too.
  "canned tomatoes": [
    {
      productId: "lipstick1",
      upc: "0004100000001",
      description: "Super Stay Teddy Tint Lipstick 130 Tomato Girl",
      brand: "Maybelline",
      size: "0.17 oz",
      regular: 13.99,
      categories: ["Beauty"],
    },
    {
      productId: "tomatoes1",
      upc: "0001111000002",
      description: "Kroger Diced Tomatoes",
      brand: "Kroger",
      size: "14.5 oz",
      regular: 1.0,
      categories: ["Canned & Packaged"],
    },
  ],
  "olive oil": [
    {
      productId: "oil1",
      upc: "0001111000001",
      description: "Kroger Extra Virgin Olive Oil",
      brand: "Kroger",
      size: "16 fl oz",
      regular: 7.99,
    },
  ],
  "ground beef": [
    {
      productId: "beef1",
      upc: "0020000000001",
      description: "Kroger 80/20 Ground Beef",
      brand: "Kroger",
      size: "1 lb",
      regular: 5.49,
    },
  ],
}
const ALL = Object.values(PRODUCTS).flat()

const LOCATIONS = [
  {
    locationId: "70500822",
    chain: "FRYS",
    name: "Fry's Food Stores - 20th St",
    address: { addressLine1: "4724 N 20th St", city: "Phoenix", state: "AZ" },
  },
  {
    locationId: "70500830",
    chain: "FRYS",
    name: "Fry's Marketplace - Camelback",
    address: { addressLine1: "3330 E Camelback", city: "Phoenix", state: "AZ" },
  },
]

const asProduct = (found: FakeProduct) => ({
  productId: found.productId,
  categories: found.categories,
  upc: found.upc,
  brand: found.brand,
  description: found.description,
  productPageURI: `/p/${found.productId}`,
  images: [
    {
      perspective: "front",
      sizes: [{ size: "medium", url: `https://img.test/${found.productId}` }],
    },
  ],
  items: [
    {
      size: found.size,
      price: {
        regular: found.regular,
        promo: found.promo ?? 0,
        ...(found.until && { expirationDate: { value: found.until } }),
      },
      inventory: {
        stockLevel: found.out ? "TEMPORARILY_OUT_OF_STOCK" : "HIGH",
      },
    },
  ],
})

/** What Kroger was asked and did. */
const kroger = {
  challenge: "",
  codes: new Map<string, string>(),
  refreshRefused: false,
  carts: [] as { token: string; items: unknown[] }[],
  searched: [] as string[],
}

const fetcher: Fetcher = async (url, options?: FetchOptions) => {
  const answer = (status: number, body?: unknown) => ({
    url,
    status,
    contentType: "application/json",
    body: Buffer.from(body === undefined ? "" : JSON.stringify(body)),
  })
  if (!url.startsWith(KROGER)) return answer(404, {})
  const path = url.slice(KROGER.length)
  const auth = options?.headers?.authorization ?? ""

  if (path === "/connect/oauth2/token") {
    const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString(
      "base64"
    )
    if (auth !== `Basic ${basic}`)
      return answer(401, { error: "invalid_client" })
    const form = options?.form ?? {}
    if (form.grant_type === "client_credentials") {
      return answer(200, { access_token: "app-token", expires_in: 1800 })
    }
    if (form.grant_type === "authorization_code") {
      const verifier = form.code_verifier ?? ""
      const challenge = createHash("sha256")
        .update(verifier)
        .digest("base64url")
      if (form.code !== "good-code" || challenge !== kroger.challenge) {
        return answer(400, { error: "invalid_grant" })
      }
      kroger.codes.set(form.code, form.redirect_uri ?? "")
      return answer(200, {
        access_token: "user-token-1",
        refresh_token: "refresh-1",
        expires_in: 1800,
      })
    }
    if (form.grant_type === "refresh_token") {
      if (kroger.refreshRefused || form.refresh_token !== "refresh-1") {
        return answer(400, { error: "invalid_grant" })
      }
      return answer(200, {
        access_token: "user-token-2",
        refresh_token: "refresh-1",
        expires_in: 1800,
      })
    }
    return answer(400, { error: "unsupported_grant_type" })
  }

  if (path === "/cart/add") {
    if (!auth.startsWith("Bearer user-token")) return answer(401, {})
    kroger.carts.push({
      token: auth.slice("Bearer ".length),
      items: (options?.json as { items: unknown[] }).items,
    })
    return answer(204)
  }

  if (auth !== "Bearer app-token") return answer(401, {})
  const query = new URL(url).searchParams
  if (path.startsWith("/locations?")) {
    return answer(200, {
      data: query.get("filter.zipCode.near") === "85016" ? LOCATIONS : [],
    })
  }
  if (path.startsWith("/locations/")) {
    const found = LOCATIONS.find((l) => path.endsWith(`/${l.locationId}`))
    return found ? answer(200, { data: found }) : answer(404, {})
  }
  if (path.startsWith("/products?")) {
    const ids = query.get("filter.productId")
    if (ids) {
      const wanted = ids.split(",")
      return answer(200, {
        data: ALL.filter((p) => wanted.includes(p.productId)).map(asProduct),
      })
    }
    const term = query.get("filter.term") ?? ""
    kroger.searched.push(term)
    return answer(200, { data: (PRODUCTS[term] ?? []).map(asProduct) })
  }
  return answer(404, {})
}

let app: App
let database: Database
let close: () => Promise<void>
let settings: Settings
let kyle: TestClient
let jamie: TestClient
/** The linked account's sealed tokens. */
let tokensId: string

beforeAll(async () => {
  const test = await createTestApp({ fetcher })
  ;({ app, database, close, settings } = test)
  kyle = await setUpServer(app, test.setupCode)
  jamie = await join(app, await inviteToken(kyle), account("jamie", "Jamie"))
})

afterAll(() => close())

const status = async (client = kyle) =>
  (await (await client.get("/api/stores")).json()).kroger

/** Links Kyle's Kroger account, as Kroger sends Kyle back. */
async function link() {
  const res = await kyle.post("/api/stores/kroger/link")
  expect(res.status, await res.clone().text()).toBe(200)
  const url = new URL((await res.json()).url)
  kroger.challenge = url.searchParams.get("code_challenge") ?? ""
  return url
}

const callback = (client: TestClient, query: Record<string, string>) =>
  client.get(`/api/stores/kroger/callback?${new URLSearchParams(query)}`)

describe("Kroger", () => {
  test("is off until the server has a Kroger app", async () => {
    expect(await status()).toMatchObject({
      ready: false,
      location: null,
      linked: null,
    })
    const capabilities = await (await kyle.get("/api/capabilities")).json()
    expect(capabilities.capabilities).not.toContain("stores.kroger")
    const near = await kyle.get("/api/stores/kroger/locations?zip=85016")
    expect(near.status).toBe(422)
    expect((await near.json()).error.code).toBe("kroger_off")

    // The redirect address the Kroger app is given.
    const settings = await (await kyle.get("/api/settings/server")).json()
    expect(settings.kroger).toEqual({
      redirectUri: `${TEST_ORIGIN}/api/stores/kroger/callback`,
    })
  })

  test("a server admin's app is tested with Kroger before it's saved", async () => {
    const wrong = await kyle.post("/api/settings/server/kroger/test", {
      clientId: CLIENT_ID,
      clientSecret: "not it",
    })
    expect(wrong.status).toBe(422)
    expect((await wrong.json()).error.code).toBe("kroger_app_refused")

    const nothing = await kyle.post("/api/settings/server/kroger/test", {})
    expect(nothing.status).toBe(400)

    const right = await kyle.post("/api/settings/server/kroger/test", {
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
    })
    expect(right.status, await right.clone().text()).toBe(200)

    // Only a server admin.
    const member = await jamie.post("/api/settings/server/kroger/test", {})
    expect(member.status).toBe(403)

    const saved = await kyle.patch("/api/settings/server", {
      "stores.krogerClientId": CLIENT_ID,
      "stores.krogerClientSecret": CLIENT_SECRET,
    })
    expect(saved.status, await saved.clone().text()).toBe(200)
    const capabilities = await (await kyle.get("/api/capabilities")).json()
    expect(capabilities.capabilities).toContain("stores.kroger")
    expect((await status()).ready).toBe(true)

    // And with the saved ones.
    const again = await kyle.post("/api/settings/server/kroger/test", {})
    expect(again.status).toBe(200)
  })

  test("a household picks its store near a ZIP code, and how it shops", async () => {
    const bad = await kyle.get("/api/stores/kroger/locations?zip=850")
    expect(bad.status).toBe(400)

    const near = await kyle.get("/api/stores/kroger/locations?zip=85016")
    expect(near.status, await near.clone().text()).toBe(200)
    const { locations } = await near.json()
    expect(locations).toHaveLength(2)
    expect(locations[0]).toEqual({
      locationId: "70500822",
      name: "Fry's Food Stores - 20th St",
      banner: "Fry's",
      domain: "frysfood.com",
      address: "4724 N 20th St, Phoenix, AZ",
    })

    // Only those who run the household pick.
    const member = await jamie.put("/api/stores/kroger", {
      locationId: "70500822",
    })
    expect(member.status).toBe(403)

    const unknown = await kyle.put("/api/stores/kroger", { locationId: "1" })
    expect(unknown.status).toBe(404)

    const picked = await kyle.put("/api/stores/kroger", {
      locationId: "70500822",
    })
    expect(picked.status, await picked.clone().text()).toBe(200)
    expect((await picked.json()).kroger).toMatchObject({
      location: { banner: "Fry's", locationId: "70500822" },
      modality: "PICKUP",
    })

    const delivered = await kyle.put("/api/stores/kroger", {
      modality: "DELIVERY",
    })
    expect((await delivered.json()).kroger.modality).toBe("DELIVERY")
    // Everyone in it sees the store.
    expect((await status(jamie)).location.name).toBe(
      "Fry's Food Stores - 20th St"
    )
  })

  test("links an account through Kroger's sign-in, with PKCE", async () => {
    const url = await link()
    expect(url.origin + url.pathname).toBe(`${KROGER}/connect/oauth2/authorize`)
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: CLIENT_ID,
      response_type: "code",
      redirect_uri: `${TEST_ORIGIN}/api/stores/kroger/callback`,
      code_challenge_method: "S256",
      scope: expect.stringContaining("cart.basic:write"),
    })
    const state = url.searchParams.get("state")!

    // Said no at Kroger.
    const cancelled = await callback(kyle, { error: "access_denied", state })
    expect(cancelled.status).toBe(302)
    expect(cancelled.headers.get("location")).toBe(
      "/settings/household?kroger=cancelled"
    )

    // Someone else can't finish Kyle's link.
    const other = await callback(jamie, { code: "good-code", state })
    expect(other.headers.get("location")).toMatch(
      /^\/settings\/household\?kroger=failed&reason=/
    )

    // A made-up state goes nowhere.
    const madeUp = await callback(kyle, { code: "good-code", state: "nope" })
    expect(madeUp.headers.get("location")).toMatch(/kroger=failed/)

    const linked = await callback(kyle, { code: "good-code", state })
    expect(linked.status).toBe(302)
    expect(linked.headers.get("location")).toBe(
      "/settings/household?kroger=linked"
    )
    // Kroger was asked with the address it was sent to.
    expect(kroger.codes.get("good-code")).toBe(
      `${TEST_ORIGIN}/api/stores/kroger/callback`
    )
    expect(await status()).toMatchObject({
      linked: { by: "Kyle" },
      needsRelink: false,
    })

    // Its tokens are sealed, not kept as they came.
    const em = database.em.fork()
    const connection = await em.findOneOrFail(
      StoreConnection,
      { store: "kroger" },
      { ...ACROSS_HOUSEHOLDS, populate: ["account"] }
    )
    expect(connection.pendingState).toBeNull()
    const secret = connection.account!.getEntity()
    expect(JSON.stringify(secret)).not.toContain("user-token-1")
    tokensId = secret.id

    // The same state can't be used again.
    const replay = await callback(kyle, { code: "good-code", state })
    expect(replay.headers.get("location")).toMatch(/kroger=failed/)
  })

  let milk: string
  let eggs: string
  let beef: string
  let saffron: string
  let salt: string

  test("the list at the store: a product for each thing, how many, and its price", async () => {
    const add = async (text: string) => {
      const res = await kyle.post("/api/list/items", { text })
      expect(res.status, await res.clone().text()).toBe(201)
      return (await res.json()).id as string
    }
    milk = await add("1 gallon milk")
    eggs = await add("18 eggs")
    beef = await add("2 lb ground beef")
    saffron = await add("1 pinch saffron")
    salt = await add("Pinch of salt")

    const res = await kyle.get("/api/stores/kroger/basket")
    expect(res.status, await res.clone().text()).toBe(200)
    const basket = await res.json()
    expect(basket).toMatchObject({
      store: "Fry's",
      modality: "DELIVERY",
      linked: true,
      sentAt: null,
    })
    const line = (id: string) =>
      basket.lines.find((one: { itemId: string }) => one.itemId === id)

    expect(line(milk)).toMatchObject({
      name: "milk",
      suggested: true,
      packages: 1,
      sure: true,
      sent: false,
      product: {
        id: "milk1",
        price: 349,
        salePrice: 299,
        saleEnds: "2099-10-21",
        url: "https://www.frysfood.com/p/milk1",
      },
    })
    // Without AI, the first in stock: the first eggs are out.
    expect(line(eggs).product.id).toBe("eggs2")
    // 18 eggs is two boxes of 12.
    expect(line(eggs)).toMatchObject({ packages: 2, sure: true })
    expect(line(beef)).toMatchObject({ packages: 2, sure: true })
    expect(line(saffron).product).toBeNull()
    // Typed as "Pinch of salt", it's searched for as salt.
    expect(line(salt)).toMatchObject({
      name: "Pinch of salt",
      product: { id: "salt1" },
    })

    // Today's prices are kept.
    const prices = await database.em
      .fork()
      .find(StorePrice, { store: "kroger" }, ACROSS_HOUSEHOLDS)
    expect(prices.map((price) => price.productId)).toEqual(
      expect.arrayContaining(["milk1", "eggs2", "beef1"])
    )

    // Picks are kept: the next look doesn't search again.
    kroger.searched.length = 0
    await kyle.get("/api/stores/kroger/basket")
    expect(kroger.searched).toEqual(["saffron"])
  })

  test("searches for food: in American words, and not the beauty aisle", async () => {
    const res = await kyle.get(
      `/api/stores/kroger/search?q=${encodeURIComponent("tinned tomatoes")}`
    )
    expect(res.status, await res.clone().text()).toBe(200)
    expect(
      (await res.json()).products.map((p: { id: string }) => p.id)
    ).toEqual(["tomatoes1"])
  })

  test("another product is picked from the store's search, and kept", async () => {
    const search = await kyle.get("/api/stores/kroger/search?q=eggs")
    expect(search.status).toBe(200)
    expect(
      (await search.json()).products.map((p: { id: string }) => p.id)
    ).toEqual(["eggs1", "eggs2", "eggs3"])

    const picked = await kyle.put(`/api/stores/kroger/products/${eggs}`, {
      productId: "eggs3",
    })
    expect(picked.status, await picked.clone().text()).toBe(200)
    // An 18 count is one box, and it's the household's pick now.
    expect(await picked.json()).toMatchObject({
      itemId: eggs,
      suggested: false,
      packages: 1,
      product: { id: "eggs3" },
    })

    const basket = await (await kyle.get("/api/stores/kroger/basket")).json()
    const line = basket.lines.find(
      (one: { itemId: string }) => one.itemId === eggs
    )
    expect(line).toMatchObject({ suggested: false, product: { id: "eggs3" } })
  })

  test("sends what's ticked to the linked account's cart, by barcode", async () => {
    // A member can send too: it's the household's cart.
    const res = await jamie.post("/api/stores/kroger/send", {
      lines: [
        { itemId: milk, packages: 2 },
        { itemId: eggs, packages: 1 },
        { itemId: saffron, packages: 1 },
      ],
    })
    expect(res.status, await res.clone().text()).toBe(200)
    expect(await res.json()).toEqual({
      sent: 2,
      store: "Fry's",
      cartUrl: "https://www.frysfood.com/cart",
    })
    expect(kroger.carts).toEqual([
      {
        token: "user-token-1",
        items: [
          { upc: "0001111041700", quantity: 2, modality: "DELIVERY" },
          { upc: "0001111060905", quantity: 1, modality: "DELIVERY" },
        ],
      },
    ])

    // The cart remembers what went, so it's not sent twice.
    const basket = await (await kyle.get("/api/stores/kroger/basket")).json()
    expect(basket.sentAt).not.toBeNull()
    const line = (id: string) =>
      basket.lines.find((one: { itemId: string }) => one.itemId === id)
    expect(line(milk)).toMatchObject({ sent: true, packages: 2 })
    expect(line(beef).sent).toBe(false)

    const nothing = await kyle.post("/api/stores/kroger/send", {
      lines: [{ itemId: saffron, packages: 1 }],
    })
    expect(nothing.status).toBe(400)
  })

  test("refreshes the account's token, and asks for a new link when Kroger won't", async () => {
    const expire = async () => {
      const em = database.em.fork()
      const connection = await em.findOneOrFail(
        StoreConnection,
        { store: "kroger" },
        ACROSS_HOUSEHOLDS
      )
      connection.accessExpiresAt = new Date(Date.now() - 1000)
      await em.flush()
    }
    await expire()
    const fresh = await kyle.post("/api/stores/kroger/send", {
      lines: [{ itemId: beef, packages: 2 }],
    })
    expect(fresh.status, await fresh.clone().text()).toBe(200)
    expect(kroger.carts.at(-1)?.token).toBe("user-token-2")

    await expire()
    kroger.refreshRefused = true
    const refused = await kyle.post("/api/stores/kroger/send", {
      lines: [{ itemId: beef, packages: 2 }],
    })
    expect(refused.status).toBe(409)
    expect((await refused.json()).error.code).toBe("kroger_relink")
    expect(await status()).toMatchObject({ needsRelink: true })
    const basket = await (await kyle.get("/api/stores/kroger/basket")).json()
    expect(basket.linked).toBe(false)

    // Linking again mends it.
    kroger.refreshRefused = false
    const url = await link()
    const back = await callback(kyle, {
      code: "good-code",
      state: url.searchParams.get("state")!,
    })
    expect(back.headers.get("location")).toBe(
      "/settings/household?kroger=linked"
    )
    expect(await status()).toMatchObject({ needsRelink: false })
  })

  test("unlinks the account, and its tokens go with it", async () => {
    const member = await jamie.delete("/api/stores/kroger/link")
    expect(member.status).toBe(403)

    const res = await kyle.delete("/api/stores/kroger/link")
    expect(res.status).toBe(204)
    expect(await status()).toMatchObject({ linked: null })
    const tokens = await database.em
      .fork()
      .findOne(Secret, { id: tokensId }, ACROSS_HOUSEHOLDS)
    expect(tokens).toBeNull()

    const send = await kyle.post("/api/stores/kroger/send", {
      lines: [{ itemId: beef, packages: 2 }],
    })
    expect(send.status).toBe(409)
  })
})

describe("prices, sales and deals", () => {
  const today = new Date().toISOString().slice(0, 10)
  let chickenRecipe: string

  async function addRecipe(name: string, ingredients: string[]) {
    const res = await kyle.post("/api/recipes", {
      name,
      servings: 4,
      ingredients,
      steps: ["Cook it."],
    })
    expect(res.status, await res.clone().text()).toBe(201)
    return (await res.json()).id as string
  }

  const suggest = async () => {
    const res = await kyle.post("/api/plan/suggest", {
      slots: [{ date: addDays(today, 1), meal: "dinner" }],
    })
    expect(res.status, await res.clone().text()).toBe(200)
    return (await res.json()).suggestions
  }

  test("a check is due each morning, once a day, in the household's time", () => {
    const at = (time: string) => new Date(`2026-10-16T${time}Z`)
    expect(priceCheckDue(null, "UTC", at("04:59:00"))).toBe(false)
    expect(priceCheckDue(null, "UTC", at("05:00:00"))).toBe(true)
    expect(priceCheckDue(at("05:10:00"), "UTC", at("09:00:00"))).toBe(false)
    expect(
      priceCheckDue(new Date("2026-10-15T23:00:00Z"), "UTC", at("06:00:00"))
    ).toBe(true)
    // 11:00 in UTC is 4 in the morning in Phoenix: too early there.
    expect(priceCheckDue(null, "America/Phoenix", at("11:00:00"))).toBe(false)
    expect(priceCheckDue(null, "America/Phoenix", at("12:00:00"))).toBe(true)
  })

  test("picking a store asks for its prices to be checked", async () => {
    const jobs = await database.em
      .fork()
      .find(Job, { kind: "stores.prices" }, ACROSS_HOUSEHOLDS)
    expect(jobs.length).toBeGreaterThan(0)
  })

  test("a check looks up the foods in the household's recipes", async () => {
    chickenRecipe = await addRecipe("Roast Chicken Thighs", [
      "2 lb chicken thighs",
      "1 tbsp olive oil",
      "Salt to taste",
    ])
    kroger.searched.length = 0
    const res = await kyle.post("/api/stores/kroger/prices")
    expect(res.status, await res.clone().text()).toBe(200)
    // Meat first; salt is always at home, so it isn't looked for.
    expect(kroger.searched).toEqual(["chicken thighs", "olive oil"])
    expect(await res.json()).toMatchObject({ searched: 2, deals: 1 })
    expect((await status()).pricesCheckedAt).not.toBeNull()

    // Looked for lately, so not again tomorrow.
    kroger.searched.length = 0
    await kyle.post("/api/stores/kroger/prices")
    expect(kroger.searched).toEqual([])

    // Only those who run the household check by hand.
    expect((await jamie.post("/api/stores/kroger/prices")).status).toBe(403)
  })

  test("what's on sale, judged, and the recipes it's in", async () => {
    const res = await kyle.get("/api/stores/deals")
    expect(res.status, await res.clone().text()).toBe(200)
    const deals = await res.json()
    expect(deals).toMatchObject({ store: "Fry's", leanOnSales: "some" })
    const chicken = deals.deals.find(
      (deal: { food: string }) => deal.food === "chicken thigh"
    )
    // No history yet: judged against its regular price.
    expect(chicken).toMatchObject({
      verdict: "sale",
      usual: 599,
      product: { id: "chicken1", salePrice: 399 },
    })
    expect(deals.recipes[chickenRecipe]).toEqual([
      { name: "chicken thighs", verdict: "sale" },
    ])

    // Recipes can be narrowed to those with a deal.
    await addRecipe("Plain Rice", ["1 cup rice", "2 cups water"])
    const onSale = await (await kyle.get("/api/recipes?onSale=true")).json()
    expect(onSale.recipes.map((r: { id: string }) => r.id)).toEqual([
      chickenRecipe,
    ])
  })

  test("a sale lower than any in 90 days is the lowest in a while", async () => {
    const em = database.em.fork()
    const { household } = await em.findOneOrFail(
      StoreConnection,
      { store: "kroger" },
      ACROSS_HOUSEHOLDS
    )
    for (const [days, price, salePrice] of [
      [40, 349, null],
      [25, 349, 319],
      [10, 349, null],
    ] as const) {
      em.create(StorePrice, {
        household: household.id,
        store: "kroger",
        productId: "milk1",
        day: addDays(today, -days),
        price,
        salePrice,
        currency: "USD",
      })
    }
    await em.flush()

    const basket = await (await kyle.get("/api/stores/kroger/basket")).json()
    const line = basket.lines.find(
      (one: { name: string }) => one.name === "milk"
    )
    expect(line.sale).toEqual({ verdict: "lowest", usual: 349 })
  })

  test("Fill the week leans on real deals, and says so", async () => {
    const em = database.em.fork()
    const { household } = await em.findOneOrFail(
      StoreConnection,
      { store: "kroger" },
      ACROSS_HOUSEHOLDS
    )
    const scoped = forHousehold(database.em.fork(), household.id)
    // The same roll each time: with nothing leaning on sales, it lands on
    // either; leaning a lot, the chicken on sale takes most of the room.
    const pick = async () => {
      const [suggestion] = await suggestMeals(
        scoped,
        household.id,
        [{ date: addDays(today, 1), meal: "dinner" }],
        {
          random: () => 0.3,
          sales: await salesForSuggest({ settings }, scoped, household.id),
        }
      )
      return suggestion!
    }

    const lots = await kyle.patch("/api/settings/household", {
      "stores.leanOnSales": "lots",
    })
    expect(lots.status, await lots.clone().text()).toBe(200)
    expect((await status()).leanOnSales).toBe("lots")
    const leaning = await pick()
    expect(leaning.recipe.id).toBe(chickenRecipe)
    expect(leaning.why).toContainEqual({
      kind: "onSale",
      foods: ["chicken thighs"],
      lowest: false,
    })

    // Fill the week itself says so when it picks the chicken.
    let said: { kind: string }[] = []
    for (let i = 0; i < 20 && said.length === 0; i++) {
      const [suggestion] = await suggest()
      if (suggestion.recipe.id === chickenRecipe) said = suggestion.why
    }
    expect(said).toContainEqual(expect.objectContaining({ kind: "onSale" }))

    // Off: sales don't count, and aren't a reason.
    await kyle.patch("/api/settings/household", { "stores.leanOnSales": "off" })
    expect(await salesForSuggest({ settings }, scoped, household.id)).toBeNull()
    for (let i = 0; i < 4; i++) {
      const [suggestion] = await suggest()
      expect(
        suggestion.why.some((why: { kind: string }) => why.kind === "onSale")
      ).toBe(false)
    }
  })
})

describe("buying by the package, costs and a budget", () => {
  const today = new Date().toISOString().slice(0, 10)
  const recipeId = async (name: string) =>
    (
      await (
        await kyle.get(`/api/recipes?q=${encodeURIComponent(name)}`)
      ).json()
    ).recipes[0].id as string

  test("what a recipe costs, from each line's share of its product", async () => {
    const chicken = await recipeId("Roast Chicken Thighs")
    const rice = await recipeId("Plain Rice")
    const res = await kyle.get("/api/stores/costs")
    expect(res.status, await res.clone().text()).toBe(200)
    const costs = await res.json()
    // 2 lb of thighs on sale at $3.99 a pound, and a tablespoon of a
    // 16 fl oz bottle of oil at $7.99; the salt's always at home.
    const total = Math.round(2 * 399 + 799 / 32)
    expect(costs.recipes[chicken]).toEqual({
      total,
      perServing: Math.round(total / 4),
      priced: 2,
      counted: 2,
    })
    // No price for the rice: not enough to say.
    expect(costs.recipes[rice]).toBeUndefined()
    expect(costs).toMatchObject({ currency: "USD", weeklyBudget: null })
  })

  test("a weekly budget, shared out over the meals to plan", async () => {
    const saved = await kyle.patch("/api/settings/household", {
      "stores.weeklyBudget": 50,
    })
    expect(saved.status, await saved.clone().text()).toBe(200)
    expect((await status()).weeklyBudget).toBe(50)
    expect(
      (await (await kyle.get("/api/stores/costs")).json()).weeklyBudget
    ).toBe(5000)

    const em = database.em.fork()
    const { household } = await em.findOneOrFail(
      StoreConnection,
      { store: "kroger" },
      ACROSS_HOUSEHOLDS
    )
    const scoped = forHousehold(database.em.fork(), household.id)
    const budget = await budgetForSuggest({ settings }, scoped, household.id, [
      { date: addDays(today, 1) },
    ])
    // A day's share of $50 a week, for one meal.
    expect(budget?.perMeal).toBeCloseTo(5000 / 7)
    expect(budget?.costOf.get(await recipeId("Roast Chicken Thighs"))).toBe(
      Math.round(2 * 399 + 799 / 32)
    )

    await kyle.patch("/api/settings/household", { "stores.weeklyBudget": null })
    expect((await status()).weeklyBudget).toBeNull()
  })

  test("what the list costs, and the deals on it, without a look at the store", async () => {
    const items = (await (await kyle.get("/api/list")).json()).items as {
      id: string
      name: string
    }[]
    const id = (name: string) => items.find((item) => item.name === name)!.id
    kroger.searched.length = 0
    // A member sees them too.
    const res = await jamie.get("/api/stores/list-prices")
    expect(res.status, await res.clone().text()).toBe(200)
    const prices = await res.json()
    expect(kroger.searched).toEqual([])
    expect(prices).toMatchObject({ store: "Fry's", currency: "USD" })
    // Two gallons went to the cart, at $2.99 instead of $3.49: the lowest
    // in a while.
    expect(prices.items[id("milk")]).toEqual({
      store: "Fry's",
      total: 598,
      packages: 2,
      sure: true,
      sale: { verdict: "lowest", saved: 100, ends: "2099-10-21" },
      usual: 349,
      product: "Kroger 2% Reduced Fat Milk",
      seenOn: today,
    })
    // The 18 count picked, at its regular price.
    expect(prices.items[id("eggs")]).toMatchObject({
      total: 399,
      packages: 1,
      sale: null,
      usual: null,
    })
    // No product for saffron: nothing to say.
    expect(prices.items[id("saffron")]).toBeUndefined()
  })

  test("what was sent to the cart goes in the pantry as the packs bought", async () => {
    // Two gallons of milk went to the cart for the gallon on the list.
    const list = (await (await kyle.get("/api/list")).json()).items as {
      id: string
      name: string
    }[]
    const milk = list.find((item) => item.name === "milk")!
    await kyle.post("/api/list/items/bulk", { ids: [milk.id], action: "check" })
    const res = await kyle.post("/api/list/put-away", {})
    expect(res.status, await res.clone().text()).toBe(200)
    const pantry = (await (await kyle.get("/api/pantry")).json()).items as {
      name: string
      quantity: number | null
      unit: string | null
    }[]
    expect(pantry.find((item) => item.name === "milk")).toMatchObject({
      quantity: 2,
      unit: "gallon",
    })
  })
})

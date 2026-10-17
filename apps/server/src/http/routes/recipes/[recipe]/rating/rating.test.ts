import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../../../app.ts"
import {
  createTestApp,
  setUpServer,
  TestClient,
} from "../../../../../test/app.ts"

let app: App
let close: () => Promise<void>
let kyle: TestClient

beforeAll(async () => {
  const test = await createTestApp()
  ;({ app, close } = test)
  kyle = await setUpServer(app, test.setupCode)
  await kyle.post("/api/recipes", { name: "Soup" })
})

afterAll(() => close())

const rate = (rating: unknown, recipe = "soup") =>
  kyle.request("PUT", `/api/recipes/${recipe}/rating`, { rating })

describe("a recipe's rating", () => {
  test("is set and cleared without keeping a version", async () => {
    const rated = await rate(4)
    expect(rated.status).toBe(200)
    expect((await rated.json()).rating).toBe(4)

    const cleared = await rate(null)
    expect((await cleared.json()).rating).toBeNull()

    const versions = await (await kyle.get("/api/recipes/soup/versions")).json()
    expect(versions).toEqual([])
  })

  test("is from 1 to 5 whole stars", async () => {
    for (const rating of [0, 6, 2.5, "3"]) {
      expect((await rate(rating)).status).toBe(400)
    }
    expect(
      (await kyle.request("PUT", "/api/recipes/soup/rating", {})).status
    ).toBe(400)
  })

  test("needs a recipe that's there", async () => {
    expect((await rate(3, "no-such-recipe")).status).toBe(404)
  })
})

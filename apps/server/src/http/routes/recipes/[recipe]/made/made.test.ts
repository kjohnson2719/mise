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

describe("making a recipe", () => {
  test("sets when it was last made, without keeping a version", async () => {
    const before = Date.now()
    const res = await kyle.post("/api/recipes/soup/made")
    const soup = await res.json()

    expect(res.status).toBe(200)
    expect(new Date(soup.lastMadeAt).getTime()).toBeGreaterThanOrEqual(
      before - 1000
    )
    const versions = await (await kyle.get("/api/recipes/soup/versions")).json()
    expect(versions).toEqual([])
  })

  test("needs a recipe that's there", async () => {
    expect((await kyle.post("/api/recipes/no-such-recipe/made")).status).toBe(
      404
    )
  })
})

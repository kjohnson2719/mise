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
const ids: Record<string, string> = {}

beforeAll(async () => {
  const test = await createTestApp()
  ;({ app, close } = test)
  kyle = await setUpServer(app, test.setupCode)
  for (const name of ["Soup", "Salad", "Cake"]) {
    ids[name] = (await (await kyle.post("/api/recipes", { name })).json()).id
  }
  await kyle.post("/api/recipes/bulk", {
    action: "delete",
    ids: [ids.Soup, ids.Cake],
  })
})

afterAll(() => close())

const bulk = (body: unknown) => kyle.post("/api/recipes/deleted/bulk", body)

describe("several recipes in Recently deleted at once", () => {
  test("can be put back, skipping ones that aren't there", async () => {
    const res = await bulk({ action: "restore", ids: [ids.Soup, ids.Salad] })

    // Salad wasn't in Recently deleted, so it's skipped.
    expect(await res.json()).toEqual({ changed: 1 })
    expect((await (await kyle.get("/api/recipes")).json()).total).toBe(2)
  })

  test("can be deleted for good, only from Recently deleted", async () => {
    const res = await bulk({ action: "purge", ids: [ids.Cake, ids.Soup] })

    expect(await res.json()).toEqual({ changed: 1 })
    expect(await (await kyle.get("/api/recipes/deleted")).json()).toEqual([])
    expect((await kyle.get("/api/recipes/soup")).status).toBe(200)
    expect((await kyle.get("/api/recipes/cake")).status).toBe(404)
  })

  test("needs something picked", async () => {
    expect((await bulk({ action: "restore", ids: [] })).status).toBe(400)
    expect((await bulk({ action: "delete", ids: [ids.Soup] })).status).toBe(400)
  })
})

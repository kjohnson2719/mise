import { afterAll, beforeAll, expect, test } from "vitest"
import type { App } from "../../app.ts"
import { Recipe } from "../../database/entities/index.ts"
import type { Database } from "../../database/orm.ts"
import { ACROSS_HOUSEHOLDS, NOT_DELETED_FILTER } from "../../database/scope.ts"
import { createTestApp, setUpServer, TestClient } from "../../test/app.ts"
import { enqueue } from "../jobs/jobs.ts"
import type { JobRunner } from "../jobs/runner.ts"

let app: App
let close: () => Promise<void>
let database: Database
let jobs: JobRunner
let kyle: TestClient

beforeAll(async () => {
  const test = await createTestApp()
  ;({ app, close, database, jobs } = test)
  kyle = await setUpServer(app, test.setupCode)
})

afterAll(() => close())

test("the daily job empties Recently deleted of what's been there 30 days", async () => {
  for (const name of ["Old Soup", "New Soup"]) {
    const recipe = await (await kyle.post("/api/recipes", { name })).json()
    await kyle.delete(`/api/recipes/${recipe.id}`)
  }
  const DAY = 24 * 60 * 60 * 1000
  await database.em
    .fork()
    .nativeUpdate(
      Recipe,
      { name: "Old Soup" },
      { deletedAt: new Date(Date.now() - 31 * DAY) },
      { filters: { ...ACROSS_HOUSEHOLDS.filters, [NOT_DELETED_FILTER]: false } }
    )

  await enqueue(database.em.fork(), { kind: "recipes.purgeDeleted" })
  await jobs.drain()

  const left = await (await kyle.get("/api/recipes/deleted")).json()
  expect(left.map((r: { name: string }) => r.name)).toEqual(["New Soup"])
})

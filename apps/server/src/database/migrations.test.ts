import { afterAll, beforeAll, expect, test } from "vitest"
import { createTestDatabase, testDatabaseKind } from "../test/database.ts"
import type { Database } from "./orm.ts"

let database: Database
let close: () => Promise<void>

beforeAll(async () => {
  ;({ database, close } = await createTestDatabase())
})

afterAll(() => close())

test(`the ${testDatabaseKind} migrations build exactly what the entities describe`, async () => {
  // If this fails, an entity changed without a migration: run `pnpm db:migration`.
  const missing = await database.schema.getUpdateSchemaSQL({ wrap: false })

  expect(missing.trim()).toBe("")
})

import type { DatabaseConfig } from "../core/config.ts"
import { migrate, openDatabase, type Database } from "../database/orm.ts"
import {
  DEFAULT_TEST_POSTGRES_URL,
  tempPostgresDatabase,
} from "../database/temp-postgres.ts"

/** Which database this test run uses: set per Vitest project. */
export const testDatabaseKind =
  process.env.MERRAN_TEST_DB === "postgres" ? "postgres" : "sqlite"

/**
 * A fresh, migrated database: SQLite in memory, or a new database on the
 * test Postgres server. Close it when the tests are done.
 */
export async function createTestDatabase(): Promise<{
  database: Database
  config: DatabaseConfig
  close: () => Promise<void>
}> {
  if (testDatabaseKind === "postgres") {
    const temp = await tempPostgresDatabase(
      process.env.MERRAN_TEST_POSTGRES_URL ?? DEFAULT_TEST_POSTGRES_URL
    )
    const config = { kind: "postgres" as const, url: temp.url }
    const database = await openDatabase(config)
    await migrate(database)
    return {
      database,
      config,
      close: async () => {
        await database.close()
        await temp.drop()
      },
    }
  }

  const config = { kind: "sqlite" as const, file: ":memory:" }
  const database = await openDatabase(config)
  await migrate(database)
  return { database, config, close: () => database.close() }
}

// Writes a migration for SQLite and one for Postgres from the entities:
//
//   pnpm db:migration [name]
//
// Each database is brought up to the latest migration first, then compared
// with the entities. Needs a Postgres server to compare against: set
// MERRAN_TEST_POSTGRES_URL, or run `pnpm db:test-postgres` for a throwaway one.

import { migrate, openDatabase, type Database } from "./orm.ts"
import {
  DEFAULT_TEST_POSTGRES_URL,
  tempPostgresDatabase,
} from "./temp-postgres.ts"

const name = process.argv[2]
const serverUrl =
  process.env.MERRAN_TEST_POSTGRES_URL ?? DEFAULT_TEST_POSTGRES_URL

async function makeMigration(kind: string, database: Database) {
  try {
    await migrate(database)
    const result = await database.migrator.create(undefined, false, false, name)
    console.log(
      result.diff.up.length > 0
        ? `${kind}: wrote ${result.fileName}`
        : `${kind}: no changes`
    )
  } finally {
    await database.close()
  }
}

await makeMigration(
  "SQLite",
  await openDatabase({ kind: "sqlite", file: ":memory:" })
)

let postgres
try {
  postgres = await tempPostgresDatabase(serverUrl)
} catch (err) {
  console.error(
    `Postgres: couldn't reach ${serverUrl} (${err instanceof Error ? err.message : err}).\n` +
      "Start one with `pnpm db:test-postgres`, or set MERRAN_TEST_POSTGRES_URL."
  )
  process.exit(1)
}
try {
  await makeMigration(
    "Postgres",
    await openDatabase({ kind: "postgres", url: postgres.url })
  )
} finally {
  await postgres.drop()
}

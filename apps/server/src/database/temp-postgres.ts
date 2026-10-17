import { randomBytes } from "node:crypto"
import pg from "pg"

/** The throwaway Postgres that `pnpm db:test-postgres` starts. */
export const DEFAULT_TEST_POSTGRES_URL =
  "postgres://postgres:merran@localhost:5433/postgres"

/**
 * Makes an empty database on a Postgres server, for a test or for generating
 * migrations, and drops it afterwards.
 */
export async function tempPostgresDatabase(serverUrl: string) {
  const name = `merran_tmp_${randomBytes(6).toString("hex")}`
  await admin(serverUrl, `create database ${name}`)

  const url = new URL(serverUrl)
  url.pathname = `/${name}`
  return {
    url: url.toString(),
    drop: () =>
      admin(serverUrl, `drop database if exists ${name} with (force)`),
  }
}

async function admin(serverUrl: string, sql: string) {
  const client = new pg.Client({ connectionString: serverUrl })
  await client.connect()
  try {
    await client.query(sql)
  } finally {
    await client.end()
  }
}

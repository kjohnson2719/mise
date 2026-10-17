import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { Migrator } from "@mikro-orm/migrations"
import { MikroORM as PostgresORM } from "@mikro-orm/postgresql"
import type { MikroORM } from "@mikro-orm/sql"
import { MikroORM as SqliteORM } from "@mikro-orm/sqlite"
import type { DatabaseConfig } from "../core/config.ts"
import { entities } from "./entities/index.ts"

export type Database = MikroORM

/** Each database has its own migrations, generated from the same entities. */
export function migrationsFolder(kind: DatabaseConfig["kind"]) {
  return fileURLToPath(new URL(`./migrations/${kind}/`, import.meta.url))
}

function options(kind: DatabaseConfig["kind"]) {
  const folder = migrationsFolder(kind)
  return {
    entities,
    extensions: [Migrator],
    migrations: {
      path: folder,
      pathTs: folder,
      glob: "!(*.d).ts",
      emit: "ts" as const,
      snapshot: true,
      // Not named after the database, so every run finds the same one.
      snapshotName: ".snapshot",
      silent: true,
    },
    // Always work through a fork: one per request, or forHousehold().
    allowGlobalContext: false,
  }
}

/** Connects to the database. Call `migrate()` before using it. */
export async function openDatabase(config: DatabaseConfig): Promise<Database> {
  if (config.kind === "postgres") {
    return PostgresORM.init({ ...options("postgres"), clientUrl: config.url })
  }

  if (config.file !== ":memory:") {
    mkdirSync(dirname(config.file), { recursive: true })
  }
  const orm = await SqliteORM.init({
    ...options("sqlite"),
    dbName: config.file,
  })
  // Readers never wait on a writer, and a busy database waits rather than fails.
  await orm.em.getConnection().execute("pragma journal_mode = wal")
  await orm.em.getConnection().execute("pragma busy_timeout = 5000")
  return orm
}

/** Applies any migrations not yet run. Returns their names. */
export async function migrate(database: Database): Promise<string[]> {
  const applied = await database.migrator.up()
  return applied.map((migration) => migration.name)
}

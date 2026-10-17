import { randomUUID } from "node:crypto"
import { arch } from "node:os"
import type { EntityManager } from "@mikro-orm/sql"
import { Household, Recipe, User } from "../../database/entities/index.ts"
import { ACROSS_HOUSEHOLDS } from "../../database/scope.ts"
import type { Module, ModuleContext } from "../module.ts"
import { TELEMETRY } from "./settings.ts"

/**
 * Everything the daily summary holds (docs/operations.md, "Telemetry"):
 * nothing about anyone, and counts only as ranges.
 */
export type TelemetryReport = {
  installId: string
  version: string
  install: string
  arch: string
  database: string
  modules: Record<string, boolean>
  households: string
  people: string
  recipes: string
}

/** A count as a range, so no exact number is sent: rangeOf(3, [1, 5]) is "2-5". */
export function rangeOf(count: number, bands: readonly number[]): string {
  if (count === 0) return "0"
  let low = 1
  for (const high of bands) {
    if (count <= high) return low === high ? `${high}` : `${low}-${high}`
    low = high + 1
  }
  return `${low}+`
}

async function databaseName({ config, database }: ModuleContext) {
  if (config.database.kind === "sqlite") return "sqlite"
  const [row] = await database.em
    .getConnection()
    .execute<{ version: string }[]>(
      "select current_setting('server_version_num') as version"
    )
  return `postgres ${Math.floor(Number(row?.version) / 10_000)}`
}

/** This server's random id, made the first time it's needed. */
export async function installId(em: EntityManager, ctx: ModuleContext) {
  const id = await ctx.settings.server(TELEMETRY.installId)
  if (id) return id
  return resetInstallId(em, ctx)
}

/** A new random id, so the summaries start afresh. */
export async function resetInstallId(em: EntityManager, ctx: ModuleContext) {
  const id = randomUUID()
  await ctx.settings.keepServer(em, TELEMETRY.installId, id)
  return id
}

/** The next summary, exactly as it would be sent. */
export async function buildReport(
  em: EntityManager,
  ctx: ModuleContext,
  modules: readonly Module[]
): Promise<TelemetryReport> {
  const statuses = await Promise.all(
    modules.map(async (module) => [module.id, (await module.status(ctx)).on])
  )
  return {
    installId: await installId(em, ctx),
    version: ctx.config.version,
    install: ctx.config.installMethod,
    arch: arch(),
    database: await databaseName(ctx),
    modules: Object.fromEntries(statuses),
    households: rangeOf(await em.count(Household, {}), [1, 5, 20]),
    people: rangeOf(await em.count(User, {}), [1, 5, 20, 100]),
    recipes: rangeOf(
      await em.count(Recipe, {}, ACROSS_HOUSEHOLDS),
      [99, 499, 1999]
    ),
  }
}

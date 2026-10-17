import type { MiddlewareHandler } from "hono"
import type { AppEnv } from "../../core/context.ts"
import type { Database } from "../../database/orm.ts"

/** Each request gets its own entity manager, so nothing leaks between them. */
export function entityManager(database: Database): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    c.set("em", database.em.fork())
    await next()
  }
}

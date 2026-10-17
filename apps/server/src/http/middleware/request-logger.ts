import type { MiddlewareHandler } from "hono"
import type { Logger } from "pino"
import type { AppEnv } from "../../core/context.ts"

/** Gives each request a logger tagged with its id, and logs how it went. */
export function requestLogger(logger: Logger): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const log = logger.child({ requestId: c.var.requestId })
    c.set("logger", log)
    const started = performance.now()
    await next()
    log.info(
      {
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        ms: Math.round(performance.now() - started),
      },
      "request"
    )
  }
}

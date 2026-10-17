import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { errorBody } from "../../../errors.ts"
import type { Router } from "../../../router.ts"
import { ReadySchema } from "../../../schemas/health.ts"
import { errorResponse, jsonResponse } from "../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/health/ready",
  operationId: "checkReady",
  tags: ["Server"],
  summary: "Check the server can do its work",
  description:
    "Checks the database answers and is up to date. For uptime monitors. Needs no sign-in.",
  responses: {
    200: jsonResponse(ReadySchema, "Ready."),
    503: errorResponse(
      "Not ready: the database is unreachable or out of date."
    ),
  },
})

export default (router: Router, { config, database }: AppDeps) => {
  router.openapi(route, async (c) => {
    try {
      await c.var.em.getConnection().execute("select 1")
      const pending = await database.migrator.getPending()
      if (pending.length > 0) {
        return c.json(
          errorBody("not_ready", "The database needs updating."),
          503
        )
      }
    } catch (err) {
      c.var.logger.warn({ err }, "Database check failed")
      return c.json(
        errorBody("not_ready", "The database isn't answering."),
        503
      )
    }
    return c.json(
      { status: "ready" as const, database: config.database.kind },
      200
    )
  })
}

import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { buildReport } from "../../../../modules/telemetry/report.ts"
import { serverAdmin } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import {
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"
import { TelemetryReportSchema } from "../../../schemas/settings.ts"

const route = createRoute({
  method: "get",
  path: "/telemetry/report",
  operationId: "getTelemetryReport",
  tags: ["Settings"],
  summary: "The next telemetry summary",
  description:
    "Server admins only. Exactly what the daily summary would send, whether or not it's on.",
  security: SESSION_SECURITY,
  responses: {
    200: jsonResponse(TelemetryReportSchema, "The summary."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    serverAdmin(c)
    return c.json(await buildReport(c.var.em, deps, deps.modules), 200)
  })
}

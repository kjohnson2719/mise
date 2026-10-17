import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import {
  buildReport,
  resetInstallId,
} from "../../../../modules/telemetry/report.ts"
import { serverAdmin } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import {
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"
import { TelemetryReportSchema } from "../../../schemas/settings.ts"

const route = createRoute({
  method: "post",
  path: "/telemetry/install-id",
  operationId: "renewInstallId",
  tags: ["Settings"],
  summary: "Make a new install id",
  description:
    "Server admins only. Summaries from now on can't be linked to earlier ones. Answers with the next summary.",
  security: SESSION_SECURITY,
  responses: {
    200: jsonResponse(
      TelemetryReportSchema,
      "The next summary, with the new id."
    ),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    serverAdmin(c)
    await resetInstallId(c.var.em, deps)
    return c.json(await buildReport(c.var.em, deps, deps.modules), 200)
  })
}

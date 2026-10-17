import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../core/context.ts"
import { describeModules } from "../../../modules/module.ts"
import type { Router } from "../../router.ts"
import { jsonResponse } from "../../schemas/responses.ts"
import { CapabilitiesSchema } from "../../schemas/settings.ts"

const route = createRoute({
  method: "get",
  path: "/capabilities",
  operationId: "getCapabilities",
  tags: ["Server"],
  summary: "What's on",
  description:
    "Which of Merran's optional parts are on, what they make possible, and what the web app needs from them. Needs no sign-in: the web app reads it before anyone signs in.",
  responses: { 200: jsonResponse(CapabilitiesSchema, "What's on.") },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) =>
    c.json(
      {
        version: deps.config.version,
        ...(await describeModules(deps.modules, deps)),
      },
      200
    )
  )
}

import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../core/context.ts"
import type { Router } from "../../router.ts"
import { HealthSchema } from "../../schemas/health.ts"
import { jsonResponse } from "../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/health",
  operationId: "checkHealth",
  tags: ["Server"],
  summary: "Check the server is up",
  description:
    "Answers as long as the server is running. Needs no sign-in, and says nothing personal.",
  responses: { 200: jsonResponse(HealthSchema, "The server is up.") },
})

export default (router: Router, { config }: AppDeps) => {
  router.openapi(route, (c) =>
    c.json({ status: "ok" as const, version: config.version }, 200)
  )
}

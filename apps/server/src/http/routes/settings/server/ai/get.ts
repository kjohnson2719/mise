import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { serverAi } from "../../../../../services/ai/views.ts"
import { serverAdmin } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { ServerAiSchema } from "../../../../schemas/ai.ts"
import {
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/settings/server/ai",
  operationId: "getServerAi",
  tags: ["AI"],
  summary: "The server's AI",
  description:
    "Server admins only. The server's AI keys and addresses (never the keys themselves, only their last four characters), who may use them and how much, the models they can run, every household's spend on them this month, and the last months'.",
  security: SESSION_SECURITY,
  responses: {
    200: jsonResponse(ServerAiSchema, "The server's AI."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    serverAdmin(c)
    return c.json(await serverAi(deps, c.var.em), 200)
  })
}

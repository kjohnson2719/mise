import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { savePolicy } from "../../../../../../services/ai/policy.ts"
import { serverAi } from "../../../../../../services/ai/views.ts"
import { serverAdmin } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import { AiPolicySchema, ServerAiSchema } from "../../../../../schemas/ai.ts"
import {
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"

const route = createRoute({
  method: "put",
  path: "/settings/server/ai/policy",
  operationId: "saveAiPolicy",
  tags: ["AI"],
  summary: "Change who may use the server's AI keys",
  description:
    "Server admins only. Which households the server's keys cover, each one's monthly limit on them, the tasks and models they cover, and whether households may add keys and addresses of their own. Households that are gone are dropped.",
  security: SESSION_SECURITY,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: AiPolicySchema } },
    },
  },
  responses: {
    200: jsonResponse(ServerAiSchema, "Saved."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    serverAdmin(c)
    await savePolicy(deps, c.var.em, c.req.valid("json"))
    return c.json(await serverAi(deps, c.var.em), 200)
  })
}

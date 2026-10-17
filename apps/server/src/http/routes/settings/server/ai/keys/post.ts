import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { addKey } from "../../../../../../services/ai/keys.ts"
import { serverAdmin } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import { AiKeySchema, NewAiKeySchema } from "../../../../../schemas/ai.ts"
import {
  errorResponse,
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/settings/server/ai/keys",
  operationId: "addServerAiKey",
  tags: ["AI"],
  summary: "Add an AI key or address for the server",
  description:
    "Server admins only. A provider's key replaces the server's one before it; there can be several addresses, which may be on the home network (an Ollama, say). It's tested against the provider first, at no cost, and kept sealed.",
  security: SESSION_SECURITY,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: NewAiKeySchema } },
    },
  },
  responses: {
    201: jsonResponse(AiKeySchema, "Tested and kept."),
    502: errorResponse(
      "The provider couldn't be reached, or answered with an error."
    ),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { user } = serverAdmin(c)
    const key = await addKey(deps, c.var.em, {
      householdId: null,
      userId: user.id,
      input: c.req.valid("json"),
    })
    return c.json(key, 201)
  })
}

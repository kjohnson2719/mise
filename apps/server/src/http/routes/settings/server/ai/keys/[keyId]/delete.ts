import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../../core/context.ts"
import { removeKey } from "../../../../../../../services/ai/keys.ts"
import { serverAdmin } from "../../../../../../middleware/auth.ts"
import type { Router } from "../../../../../../router.ts"
import { KeyParam } from "../../../../../../schemas/ai.ts"
import {
  errorResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../../../schemas/responses.ts"

const route = createRoute({
  method: "delete",
  path: "/settings/server/ai/keys/{keyId}",
  operationId: "removeServerAiKey",
  tags: ["AI"],
  summary: "Take off one of the server's AI keys",
  description:
    "Server admins only. One set in the server's environment can only be taken off there.",
  security: SESSION_SECURITY,
  request: { params: KeyParam },
  responses: {
    204: { description: "Taken off." },
    404: errorResponse("No such key."),
    409: errorResponse("It's set in the server's environment."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    serverAdmin(c)
    await removeKey(c.var.em, null, c.req.valid("param").keyId)
    return c.body(null, 204)
  })
}

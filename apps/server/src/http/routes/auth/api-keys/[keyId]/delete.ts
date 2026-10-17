import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { revokeApiKey } from "../../../../../services/auth/api-keys.ts"
import { AppError } from "../../../../../core/errors.ts"
import { signedIn } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { ApiKeyParam } from "../../../../schemas/api-keys.ts"
import {
  errorResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "delete",
  path: "/auth/api-keys/{keyId}",
  operationId: "revokeApiKey",
  tags: ["API keys"],
  summary: "Revoke an API key",
  description: "It stops working straight away.",
  security: SESSION_SECURITY,
  request: { params: ApiKeyParam },
  responses: {
    204: { description: "Revoked." },
    404: errorResponse("You have no such key."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { user } = signedIn(c)
    const revoked = await revokeApiKey(
      c.var.em,
      user.id,
      c.req.valid("param").keyId
    )
    if (!revoked) {
      throw new AppError(
        "not_found",
        "api_key_not_found",
        "You have no such key."
      )
    }
    return c.body(null, 204)
  })
}

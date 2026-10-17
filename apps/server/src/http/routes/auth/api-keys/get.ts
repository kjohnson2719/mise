import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { listApiKeys } from "../../../../services/auth/api-keys.ts"
import { signedIn } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { ApiKeySchema, describeApiKey } from "../../../schemas/api-keys.ts"
import {
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/auth/api-keys",
  operationId: "listApiKeys",
  tags: ["API keys"],
  summary: "Your API keys",
  description:
    "Your keys in every household you're in, newest first. The keys themselves can't be shown again.",
  security: SESSION_SECURITY,
  responses: {
    200: jsonResponse(z.array(ApiKeySchema), "Your keys."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { user } = signedIn(c)
    const keys = await listApiKeys(c.var.em, user.id)
    return c.json(keys.map(describeApiKey), 200)
  })
}

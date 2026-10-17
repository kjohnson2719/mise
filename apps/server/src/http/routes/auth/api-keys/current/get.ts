import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { ApiKey } from "../../../../../database/entities/index.ts"
import { ACROSS_HOUSEHOLDS } from "../../../../../database/scope.ts"
import { AppError } from "../../../../../core/errors.ts"
import { OPEN_TO_ANY_KEY } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { ApiKeySchema, describeApiKey } from "../../../../schemas/api-keys.ts"
import { errorResponse, jsonResponse } from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/auth/api-keys/current",
  operationId: "checkApiKey",
  tags: ["API keys"],
  summary: "Check an API key",
  description:
    "The key this request was sent with: its household and what it may do. A quick way for a tool like Home Assistant to check its key works.",
  ...OPEN_TO_ANY_KEY,
  responses: {
    200: jsonResponse(ApiKeySchema, "The key works."),
    400: errorResponse("No API key was sent."),
    401: errorResponse("The key doesn't work."),
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    if (!c.var.apiKey) {
      throw new AppError(
        "invalid",
        "api_key_needed",
        "Send an API key, as Authorization: Bearer mrn_…, to check it."
      )
    }
    const apiKey = await c.var.em.findOneOrFail(ApiKey, c.var.apiKey.id, {
      ...ACROSS_HOUSEHOLDS,
      populate: ["household"],
    })
    return c.json(describeApiKey(apiKey), 200)
  })
}

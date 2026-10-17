import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { AppError } from "../../../../core/errors.ts"
import { createApiKey } from "../../../../services/auth/api-keys.ts"
import { roleIn } from "../../../../services/households.ts"
import { inHousehold } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import {
  describeApiKey,
  NewApiKeyRequestSchema,
  NewApiKeySchema,
} from "../../../schemas/api-keys.ts"
import {
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/auth/api-keys",
  operationId: "createApiKey",
  tags: ["API keys"],
  summary: "Make an API key",
  description:
    "For the household in use, or another of yours named in `household`. It acts as you there, with only the permissions given, and stops working if you leave. The key is shown only in this response. Making a key needs a sign-in: a key can't make another.",
  security: SESSION_SECURITY,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: NewApiKeyRequestSchema } },
    },
  },
  responses: {
    201: jsonResponse(NewApiKeySchema, "Made. Copy the key now."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const inUse = inHousehold(c)
    const { userId } = inUse
    const body = c.req.valid("json")
    const householdId = body.household ?? inUse.householdId
    if (
      householdId !== inUse.householdId &&
      !(await roleIn(c.var.em, userId, householdId))
    ) {
      throw new AppError(
        "not_found",
        "household_not_found",
        "You're not in that household."
      )
    }
    const { apiKey, key } = await createApiKey(c.var.em, {
      userId,
      householdId,
      name: body.name,
      permissions: body.permissions,
      expiresInDays: body.expiresInDays,
    })
    await c.var.em.populate(apiKey, ["household"])
    return c.json({ ...describeApiKey(apiKey), key }, 201)
  })
}

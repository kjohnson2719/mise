import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { addKey } from "../../../../../../services/ai/keys.ts"
import { asHouseholdAdmin } from "../../../../../middleware/auth.ts"
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
  path: "/households/current/ai/keys",
  operationId: "addHouseholdAiKey",
  tags: ["AI"],
  summary: "Add an AI key or address for the household",
  description:
    "Household admins only, when the server admin lets households add their own: keys, and separately, OpenAI-compatible addresses, which must be public. Only this household uses them. A provider's key replaces its one before. It's tested against the provider first, at no cost, and kept sealed.",
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
    const { householdId, userId } = asHouseholdAdmin(c)
    const key = await addKey(deps, c.var.em, {
      householdId,
      userId,
      input: c.req.valid("json"),
    })
    return c.json(key, 201)
  })
}

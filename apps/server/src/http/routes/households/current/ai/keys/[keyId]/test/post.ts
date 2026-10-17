import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../../../core/context.ts"
import { testKey } from "../../../../../../../../services/ai/keys.ts"
import { asHouseholdAdmin } from "../../../../../../../middleware/auth.ts"
import type { Router } from "../../../../../../../router.ts"
import { AiKeySchema, KeyParam } from "../../../../../../../schemas/ai.ts"
import {
  errorResponse,
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/households/current/ai/keys/{keyId}/test",
  operationId: "testHouseholdAiKey",
  tags: ["AI"],
  summary: "Test one of the household's AI keys",
  description:
    "Household admins only. Asks the provider what the key can use, which costs nothing, and notes it.",
  security: SESSION_SECURITY,
  request: { params: KeyParam },
  responses: {
    200: jsonResponse(AiKeySchema, "It works."),
    404: errorResponse("No such key."),
    502: errorResponse(
      "The provider couldn't be reached, or answered with an error."
    ),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { householdId } = asHouseholdAdmin(c)
    return c.json(
      await testKey(deps, c.var.em, householdId, c.req.valid("param").keyId),
      200
    )
  })
}

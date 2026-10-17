import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../../core/context.ts"
import { removeKey } from "../../../../../../../services/ai/keys.ts"
import { asHouseholdAdmin } from "../../../../../../middleware/auth.ts"
import type { Router } from "../../../../../../router.ts"
import { KeyParam } from "../../../../../../schemas/ai.ts"
import {
  errorResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../../../schemas/responses.ts"

const route = createRoute({
  method: "delete",
  path: "/households/current/ai/keys/{keyId}",
  operationId: "removeHouseholdAiKey",
  tags: ["AI"],
  summary: "Take off one of the household's AI keys",
  description: "Household admins only.",
  security: SESSION_SECURITY,
  request: { params: KeyParam },
  responses: {
    204: { description: "Taken off." },
    404: errorResponse("No such key."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { householdId } = asHouseholdAdmin(c)
    await removeKey(c.var.em, householdId, c.req.valid("param").keyId)
    return c.body(null, 204)
  })
}

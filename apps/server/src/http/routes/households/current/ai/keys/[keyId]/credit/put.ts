import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../../../core/context.ts"
import { setKeyCredit } from "../../../../../../../../services/ai/keys.ts"
import { asHouseholdAdmin } from "../../../../../../../middleware/auth.ts"
import type { Router } from "../../../../../../../router.ts"
import {
  AiKeySchema,
  KeyCreditSchema,
  KeyParam,
} from "../../../../../../../schemas/ai.ts"
import {
  errorResponse,
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../../../../schemas/responses.ts"

const route = createRoute({
  method: "put",
  path: "/households/current/ai/keys/{keyId}/credit",
  operationId: "setHouseholdAiKeyCredit",
  tags: ["AI"],
  summary: "Note an AI key's credit",
  description:
    "Household admins only. The credit on the key now, as its provider's dashboard says: the providers don't tell a key, so Merran counts what it spends from here and warns when about a fifth is left. Entering it also tries the key again if it ran out. Null stops counting.",
  security: SESSION_SECURITY,
  request: {
    params: KeyParam,
    body: {
      required: true,
      content: { "application/json": { schema: KeyCreditSchema } },
    },
  },
  responses: {
    200: jsonResponse(AiKeySchema, "Noted."),
    404: errorResponse("No such key."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { householdId } = asHouseholdAdmin(c)
    const key = await setKeyCredit(
      deps,
      c.var.em,
      householdId,
      c.req.valid("param").keyId,
      c.req.valid("json").amount
    )
    return c.json(key, 200)
  })
}

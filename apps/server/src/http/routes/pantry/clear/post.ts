import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { clearPantry } from "../../../../services/pantry/pantry.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { PantryBeforeSchema } from "../../../schemas/pantry.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/pantry/clear",
  operationId: "clearPantry",
  tags: ["Pantry"],
  summary: "Empty the pantry",
  description:
    "Everything out. The answer says what was there, for Undo with /pantry/restore.",
  ...openToKeys("pantry", "write"),
  responses: {
    200: jsonResponse(PantryBeforeSchema, "Empty."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    return c.json(await clearPantry(em, householdId), 200)
  })
}

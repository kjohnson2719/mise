import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../core/context.ts"
import { getPantry } from "../../../services/pantry/pantry.ts"
import { inHousehold, openToKeys } from "../../middleware/auth.ts"
import type { Router } from "../../router.ts"
import { PantrySchema } from "../../schemas/pantry.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/pantry",
  operationId: "getPantry",
  tags: ["Pantry"],
  summary: "What's at home",
  description:
    "The fridge, the freezer and the cupboard: how much of each thing, its use-by date, the planned meals it's set aside for, and why to use it soon when it should be.",
  ...openToKeys("pantry", "read"),
  responses: {
    200: jsonResponse(PantrySchema, "What's at home."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    return c.json(await getPantry(em, householdId), 200)
  })
}

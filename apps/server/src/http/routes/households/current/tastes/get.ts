import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { getTastes } from "../../../../../services/plan/preferences.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { TastesSchema } from "../../../../schemas/plan.ts"
import {
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/households/current/tastes",
  operationId: "getTastes",
  tags: ["Households"],
  summary: "What the household eats",
  description:
    "Foods it avoids (an allergy is never suggested), diets every meal must fit, and how long a weeknight dinner can take. Fill the week keeps to them.",
  ...openToKeys("plan", "read"),
  responses: {
    200: jsonResponse(TastesSchema, "Its tastes."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    return c.json(await getTastes(em, householdId), 200)
  })
}

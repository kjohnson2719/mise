import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { getOnHand } from "../../../../../services/list/every-week.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { OnHandSchema } from "../../../../schemas/list.ts"
import {
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/households/current/on-hand",
  operationId: "getOnHand",
  tags: ["Households"],
  summary: "What the household always has",
  description:
    "Left off lists made from the plan: salt, pepper, water and ice to start. Each covers its kinds, so salt is kosher and sea salt too.",
  ...openToKeys("list", "read"),
  responses: {
    200: jsonResponse(OnHandSchema, "What's always on hand."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    return c.json({ items: await getOnHand(em, householdId) }, 200)
  })
}

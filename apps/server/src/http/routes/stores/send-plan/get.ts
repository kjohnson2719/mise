import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { sendPlan } from "../../../../services/stores/yours.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"
import { SendPlanQuery, SendPlanSchema } from "../../../schemas/stores.ts"

const route = createRoute({
  method: "get",
  path: "/stores/send-plan",
  operationId: "sendPlan",
  tags: ["Stores"],
  summary: "Where each thing on a list can go",
  description:
    "For Send: the stores Merran can send to, and each thing left on the list with the stores the household picked a product at for it, newest first, which is where it goes (asking when there's more than one), and where it's been sent already. Each store's part is then reviewed and sent with its basket's `items`.",
  ...openToKeys("list", "read"),
  request: { query: SendPlanQuery },
  responses: {
    200: jsonResponse(SendPlanSchema, "Where each thing can go."),
    404: errorResponse("There's no such list."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const { list } = c.req.valid("query")
    return c.json(await sendPlan(deps, em, householdId, list), 200)
  })
}

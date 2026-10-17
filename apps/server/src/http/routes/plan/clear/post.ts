import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { clearRest } from "../../../../services/plan/plan.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { PlanClearedSchema, PlanWeekSchema } from "../../../schemas/plan.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/plan/clear",
  operationId: "clearPlan",
  tags: ["Plan"],
  summary: "Clear the rest of the week",
  description:
    "Takes off the meals still planned for the rest of the week (from today, in this week; all of it, in another) and its pool. Cooked and skipped meals stay. The answer is what went, to put back with /plan/restore.",
  ...openToKeys("plan", "write"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: PlanWeekSchema } },
    },
  },
  responses: {
    200: jsonResponse(PlanClearedSchema, "Cleared."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const before = await clearRest(em, householdId, c.req.valid("json").week)
    return c.json({ before }, 200)
  })
}

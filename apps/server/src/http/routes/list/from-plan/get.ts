import { createRoute } from "@hono/zod-openapi"
import { addDays, weekStartOf } from "@merran/shared"
import type { AppDeps } from "../../../../core/context.ts"
import { previewFromPlan } from "../../../../services/list/meals.ts"
import { householdClock } from "../../../../services/plan/plan.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { FromPlanPreviewSchema, FromPlanQuery } from "../../../schemas/list.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/list/from-plan",
  operationId: "previewFromPlan",
  tags: ["List"],
  summary: "What adding from the plan would add",
  description:
    "Planned meals from one day to another that aren't on the list yet, and how many are: the rest of this week if no days are given. Meals with a recipe only; notes aren't shopped for.",
  ...openToKeys("list", "read"),
  request: { query: FromPlanQuery },
  responses: {
    200: jsonResponse(FromPlanPreviewSchema, "The meals."),
    400: errorResponse("Days out of order, or too many at once."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    let { from, to } = c.req.valid("query")
    if (!from || !to) {
      const clock = await householdClock(em, householdId)
      from = clock.today
      to = addDays(weekStartOf(clock.today, clock.weekStartsOn), 6)
    }
    return c.json(await previewFromPlan(em, { from, to }), 200)
  })
}

import { createRoute } from "@hono/zod-openapi"
import { addDays, weekStartOf } from "@merran/shared"
import type { AppDeps } from "../../../core/context.ts"
import { householdClock, listPlan } from "../../../services/plan/plan.ts"
import { inHousehold, openToKeys } from "../../middleware/auth.ts"
import type { Router } from "../../router.ts"
import { PlanQuerySchema, PlanSchema } from "../../schemas/plan.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/plan",
  operationId: "getPlan",
  tags: ["Plan"],
  summary: "The plan for some days",
  description:
    "Meals from one day to another, up to 62 days apart, in a day's order: this week's if no days are given. A week's pool (meals for any day of it) is dated to the week's first day, with `anyDay` set. Meals of recipes in Recently deleted are left out until they're restored.",
  ...openToKeys("plan", "read"),
  request: { query: PlanQuerySchema },
  responses: {
    200: jsonResponse(PlanSchema, "The meals."),
    400: errorResponse("Not days, or too many of them."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    let { from, to } = c.req.valid("query")
    if (!from) {
      const clock = await householdClock(em, householdId)
      from = weekStartOf(clock.today, clock.weekStartsOn)
    }
    to ??= addDays(from, 6)
    return c.json({ entries: await listPlan(em, { from, to }) }, 200)
  })
}

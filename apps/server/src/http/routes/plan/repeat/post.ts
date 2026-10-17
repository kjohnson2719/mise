import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { repeatLastWeek } from "../../../../services/plan/plan.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { PlanSchema, PlanWeekSchema } from "../../../schemas/plan.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/plan/repeat",
  operationId: "repeatLastWeek",
  tags: ["Plan"],
  summary: "Repeat last week",
  description:
    "The week before's meals, again: each on the same weekday and meal where that slot is still empty, and its pool into this week's pool. Skipped meals stay behind; the copies start as planned. The answer is what was added, for Undo (take them off in bulk).",
  ...openToKeys("plan", "write"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: PlanWeekSchema } },
    },
  },
  responses: {
    200: jsonResponse(PlanSchema, "What was added."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const entries = await repeatLastWeek(
      em,
      householdId,
      c.req.valid("json").week
    )
    return c.json({ entries }, 200)
  })
}

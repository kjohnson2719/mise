import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { bulkPlan } from "../../../../../services/plan/plan.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  PlanBulkResultSchema,
  PlanBulkSchema,
} from "../../../../schemas/plan.ts"
import {
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/plan/entries/bulk",
  operationId: "changePlanEntries",
  tags: ["Plan"],
  summary: "Change several meals at once",
  description:
    "Take them off, move them (to another day or meal, or the week's pool), or mark them planned, cooked or skipped: all or none. The answer says what they were before, for Undo with /plan/restore. Ids not on the plan are passed over.",
  ...openToKeys("plan", "write"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: PlanBulkSchema } },
    },
  },
  responses: {
    200: jsonResponse(PlanBulkResultSchema, "Done."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const { ids, action, date, meal, anyDay, status } = c.req.valid("json")
    const result = await bulkPlan(
      em,
      householdId,
      ids,
      action === "remove"
        ? { action }
        : action === "move"
          ? { action, date: date!, meal, anyDay }
          : { action, status: status! }
    )
    return c.json(result, 200)
  })
}

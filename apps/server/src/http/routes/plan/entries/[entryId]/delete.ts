import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { removeEntry } from "../../../../../services/plan/plan.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  PlanEntryParam,
  PlanEntrySnapshotSchema,
} from "../../../../schemas/plan.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "delete",
  path: "/plan/entries/{entryId}",
  operationId: "removePlanEntry",
  tags: ["Plan"],
  summary: "Take a meal off the plan",
  description:
    "The answer is the meal as it was, to put back with /plan/restore (Undo).",
  ...openToKeys("plan", "write"),
  request: { params: PlanEntryParam },
  responses: {
    200: jsonResponse(PlanEntrySnapshotSchema, "Taken off."),
    404: errorResponse("No such meal on the plan."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    return c.json(
      await removeEntry(em, householdId, c.req.valid("param").entryId),
      200
    )
  })
}

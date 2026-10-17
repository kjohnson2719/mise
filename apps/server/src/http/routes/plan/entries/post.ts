import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { addEntry } from "../../../../services/plan/plan.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { NewPlanEntrySchema, PlanEntrySchema } from "../../../schemas/plan.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/plan/entries",
  operationId: "addPlanEntry",
  tags: ["Plan"],
  summary: "Put a meal on the plan",
  description:
    "A recipe or a note, on a day's meal, after any dishes already there. With `anyDay`, it goes in the pool of the week the date is in.",
  ...openToKeys("plan", "write"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: NewPlanEntrySchema } },
    },
  },
  responses: {
    201: jsonResponse(PlanEntrySchema, "On the plan."),
    404: errorResponse("No such recipe."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    return c.json(await addEntry(em, householdId, c.req.valid("json")), 201)
  })
}

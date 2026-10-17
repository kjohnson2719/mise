import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { addEntries } from "../../../../../services/plan/plan.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  NewPlanEntriesSchema,
  PlanEntriesSchema,
} from "../../../../schemas/plan.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/plan/entries/batch",
  operationId: "addPlanEntries",
  tags: ["Plan"],
  summary: "Put several meals on the plan",
  description:
    "Like putting each on, but all or none: what Fill the week adds. Each goes after any dishes already in its slot.",
  ...openToKeys("plan", "write"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: NewPlanEntriesSchema } },
    },
  },
  responses: {
    201: jsonResponse(PlanEntriesSchema, "On the plan."),
    404: errorResponse("No such recipe."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const { entries } = c.req.valid("json")
    return c.json({ entries: await addEntries(em, householdId, entries) }, 201)
  })
}

import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { planAheadNow } from "../../../../../services/plan/autoplan.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { AutoplanRunSchema } from "../../../../schemas/plan.ts"
import {
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/plan/autoplan/run",
  operationId: "planAheadNow",
  tags: ["Plan"],
  summary: "Plan the week ahead now",
  description:
    "What the autoplan does, now: the next week starting today or later, its empty meals filled, and onto the list if the autoplan says so. That week counts as planned, so the autoplan won't plan it again.",
  ...openToKeys("plan", "write"),
  responses: {
    200: jsonResponse(AutoplanRunSchema, "Planned."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    // The change announces itself, as a request.
    return c.json(await planAheadNow(em, householdId, deps), 200)
  })
}

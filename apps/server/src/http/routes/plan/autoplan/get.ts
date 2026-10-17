import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { getAutoplan } from "../../../../services/plan/autoplan.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { AutoplanSchema } from "../../../schemas/plan.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/plan/autoplan",
  operationId: "getAutoplan",
  tags: ["Plan"],
  summary: "The weekly autoplan",
  description:
    "When it runs (a day and hour in the household's time zone), the meals it fills, whether it puts them on the list, when it runs next and what it did last.",
  ...openToKeys("plan", "read"),
  responses: {
    200: jsonResponse(AutoplanSchema, "The autoplan."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    return c.json(await getAutoplan(em, householdId), 200)
  })
}

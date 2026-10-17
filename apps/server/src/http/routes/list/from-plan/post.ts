import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { addFromPlan } from "../../../../services/list/meals.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { FromPlanResultSchema, FromPlanSchema } from "../../../schemas/list.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/list/from-plan",
  operationId: "addFromPlan",
  tags: ["List"],
  summary: "Add planned meals to the list",
  description:
    "The ingredients of planned meals from one day to another that aren't on the list yet: scaled to their servings, their sides' too, added up across meals and into what's there, leaving off what's always on hand. Every-week items not on the list come along. From then on the list follows the plan: taking a meal off, skipping it or changing it takes its share back off.",
  ...openToKeys("list", "write"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: FromPlanSchema } },
    },
  },
  responses: {
    200: jsonResponse(FromPlanResultSchema, "Added."),
    400: errorResponse("Days out of order, or too many at once."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    return c.json(await addFromPlan(em, householdId, c.req.valid("json")), 200)
  })
}

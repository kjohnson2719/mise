import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { saveTastes } from "../../../../../services/plan/preferences.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { TastesSchema } from "../../../../schemas/plan.ts"
import {
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "put",
  path: "/households/current/tastes",
  operationId: "setTastes",
  tags: ["Households"],
  summary: "Change what the household eats",
  description:
    "Anyone in the household can: everyone eats. Replaces them all; a food listed twice is kept once, as an allergy if either says so.",
  ...openToKeys("plan", "write"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: TastesSchema } },
    },
  },
  responses: {
    200: jsonResponse(TastesSchema, "Saved."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    return c.json(await saveTastes(em, householdId, c.req.valid("json")), 200)
  })
}

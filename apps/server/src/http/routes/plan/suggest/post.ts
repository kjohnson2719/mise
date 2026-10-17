import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { suggestMeals } from "../../../../services/plan/suggest.ts"
import { budgetForSuggest } from "../../../../services/stores/costs.ts"
import { salesForSuggest } from "../../../../services/stores/prices.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import {
  SuggestionsSchema,
  SuggestRequestSchema,
} from "../../../schemas/plan.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/plan/suggest",
  operationId: "suggestMeals",
  tags: ["Plan"],
  summary: "Suggest meals for open slots",
  description:
    "A recipe for each slot, saying why: Fill the week and Something else. Keeps to the household's tastes and theme nights, doesn't repeat a dish within two weeks, and pairs a side when one goes with it. Nothing is planned; slots with nothing suitable are left out. Asking again gives other ideas.",
  ...openToKeys("plan", "read"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: SuggestRequestSchema } },
    },
  },
  responses: {
    200: jsonResponse(SuggestionsSchema, "Ideas, in the slots' order."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const { slots, exclude } = c.req.valid("json")
    const suggestions = await suggestMeals(em, householdId, slots, {
      exclude,
      sales: await salesForSuggest(deps, em, householdId),
      budget: await budgetForSuggest(deps, em, householdId, slots),
    })
    return c.json({ suggestions }, 200)
  })
}

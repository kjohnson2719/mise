import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { listCosts } from "../../../../services/stores/costs.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../../schemas/responses.ts"
import { CostsSchema } from "../../../schemas/stores.ts"

const route = createRoute({
  method: "get",
  path: "/stores/costs",
  operationId: "listRecipeCosts",
  tags: ["Stores"],
  summary: "What recipes cost",
  description:
    "What each recipe costs at the household's Kroger store, from each line's share of its product's price today, where most of its lines have a price; and the household's weekly budget.",
  ...openToKeys("recipes", "read"),
  responses: {
    200: jsonResponse(CostsSchema, "Its recipes' costs."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    return c.json(await listCosts(deps, em, householdId), 200)
  })
}

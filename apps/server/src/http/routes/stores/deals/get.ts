import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { listDeals } from "../../../../services/stores/prices.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../../schemas/responses.ts"
import { DealsSchema } from "../../../schemas/stores.ts"

const route = createRoute({
  method: "get",
  path: "/stores/deals",
  operationId: "listDeals",
  tags: ["Stores"],
  summary: "What's on sale",
  description:
    "What's on sale at the household's store, by food, each sale judged against what the product usually costs (the lowest in a while first), and the recipes they're in. From the prices the household has seen this past week: nothing without a Kroger store.",
  ...openToKeys("list", "read"),
  responses: {
    200: jsonResponse(DealsSchema, "Its deals."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    return c.json(await listDeals(deps, em, householdId), 200)
  })
}

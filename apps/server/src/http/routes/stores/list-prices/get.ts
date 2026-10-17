import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { listPrices } from "../../../../services/stores/list-prices.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../../schemas/responses.ts"
import { ListPricesSchema } from "../../../schemas/stores.ts"

const route = createRoute({
  method: "get",
  path: "/stores/list-prices",
  operationId: "listItemPrices",
  tags: ["Stores"],
  summary: "What the list costs",
  description:
    "What each thing left to get on the list for the household's Kroger store costs, for the packages needed, and the real deals among them. From the product kept for each food and the last price seen for it, without a look at the store: nothing without a Kroger store.",
  ...openToKeys("list", "read"),
  responses: {
    200: jsonResponse(ListPricesSchema, "Its prices."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    return c.json(await listPrices(deps, em, householdId), 200)
  })
}

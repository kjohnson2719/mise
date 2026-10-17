import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { krogerBasket } from "../../../../../services/stores/basket.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"
import {
  BasketQuery,
  BasketSchema,
  itemIdsOf,
} from "../../../../schemas/stores.ts"

const route = createRoute({
  method: "get",
  path: "/stores/kroger/basket",
  operationId: "getKrogerBasket",
  tags: ["Stores"],
  summary: "The Kroger cart to look over",
  description:
    "Each thing left to get (the ones asked for, which Send has going to Kroger; or without them, everything left on every list) with its product: the one the household picked before, at today's price, or Merran's pick from the store's search, made by the household's model for shopping when it has AI. How many packages, worked out from the product's size where it can be. Nothing is sent until `POST /stores/kroger/send`.",
  ...openToKeys("list", "write"),
  request: { query: BasketQuery },
  responses: {
    200: jsonResponse(BasketSchema, "The cart to look over."),
    422: errorResponse("Kroger isn't set up, or the household has no store."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    const { items } = c.req.valid("query")
    return c.json(
      await krogerBasket(deps, em, { householdId, userId }, itemIdsOf(items)),
      200
    )
  })
}

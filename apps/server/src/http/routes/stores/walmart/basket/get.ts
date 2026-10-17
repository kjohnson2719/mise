import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { walmartBasket } from "../../../../../services/stores/walmart.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"
import { BasketQuery } from "../../../../schemas/stores.ts"
import { WalmartBasketSchema } from "../../../../schemas/walmart.ts"

const route = createRoute({
  method: "get",
  path: "/stores/walmart/basket",
  operationId: "getWalmartBasket",
  tags: ["Stores"],
  summary: "The Walmart cart to look over",
  description:
    "Experimental, when the server admin has turned Walmart on. Each thing left on a list (the one asked for, the one the person's looking at; or without one the list for Walmart, else the lists for any store) with its product, the household's own pick or Merran's, how many and what it cost when last seen; and what's still to find at Walmart, which Merran's browser extension looks for in the person's own Walmart tab. Merran never reaches Walmart itself.",
  ...openToKeys("list", "read"),
  request: { query: BasketQuery },
  responses: {
    200: jsonResponse(WalmartBasketSchema, "The cart to look over."),
    404: errorResponse("There's no such list."),
    422: errorResponse("Walmart isn't turned on on this server."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const { list } = c.req.valid("query")
    return c.json(await walmartBasket(deps, em, householdId, list), 200)
  })
}

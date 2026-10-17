import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { pickWalmartProduct } from "../../../../../../services/stores/walmart.ts"
import { inHousehold, openToKeys } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"
import { BasketLineSchema, ItemParam } from "../../../../../schemas/stores.ts"
import { WalmartPickSchema } from "../../../../../schemas/walmart.ts"

const route = createRoute({
  method: "put",
  path: "/stores/walmart/products/{itemId}",
  operationId: "pickWalmartProduct",
  tags: ["Stores"],
  summary: "Buy this at Walmart for a thing on the list",
  description:
    "A product someone picked from Walmart, as the extension read it: kept for the thing's food from now on, and never replaced by Merran's picks.",
  ...openToKeys("list", "write"),
  request: {
    params: ItemParam,
    body: {
      required: true,
      content: { "application/json": { schema: WalmartPickSchema } },
    },
  },
  responses: {
    200: jsonResponse(BasketLineSchema, "Kept, and the line as it is."),
    404: errorResponse("Not on the list."),
    422: errorResponse("Walmart isn't turned on on this server."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const { itemId } = c.req.valid("param")
    const { product } = c.req.valid("json")
    return c.json(
      await pickWalmartProduct(deps, em, { householdId, itemId, product }),
      200
    )
  })
}

import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { pickKrogerProduct } from "../../../../../../services/stores/basket.ts"
import { inHousehold, openToKeys } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"
import {
  BasketLineSchema,
  ItemParam,
  PickProductSchema,
} from "../../../../../schemas/stores.ts"

const route = createRoute({
  method: "put",
  path: "/stores/kroger/products/{itemId}",
  operationId: "pickKrogerProduct",
  tags: ["Stores"],
  summary: "Pick a product for something on the list",
  description:
    "Kept for that food from now on, at the household's store, and never replaced by itself.",
  ...openToKeys("list", "write"),
  request: {
    params: ItemParam,
    body: {
      required: true,
      content: { "application/json": { schema: PickProductSchema } },
    },
  },
  responses: {
    200: jsonResponse(BasketLineSchema, "Its line, with the product."),
    404: errorResponse("No such thing on the list, or product at the store."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const line = await pickKrogerProduct(deps, em, {
      householdId,
      itemId: c.req.valid("param").itemId,
      productId: c.req.valid("json").productId,
    })
    return c.json(line, 200)
  })
}

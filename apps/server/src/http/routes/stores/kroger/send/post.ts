import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { sendKrogerBasket } from "../../../../../services/stores/basket.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"
import { SendBasketSchema, SentSchema } from "../../../../schemas/stores.ts"

const route = createRoute({
  method: "post",
  path: "/stores/kroger/send",
  operationId: "sendKrogerBasket",
  tags: ["Stores"],
  summary: "Send to the Kroger cart",
  description:
    "Adds the lines given to the linked account's cart, so many of each, by barcode. Their products are kept as the household's from now on. Kroger's API can only add to a cart: checking out is on Kroger's site.",
  ...openToKeys("list", "write"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: SendBasketSchema } },
    },
  },
  responses: {
    200: jsonResponse(SentSchema, "Sent."),
    400: errorResponse("None of them has a product."),
    409: errorResponse("Kroger stopped taking the account: link it again."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    return c.json(
      await sendKrogerBasket(deps, em, c.req.valid("json").lines),
      200
    )
  })
}

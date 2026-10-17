import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { walmartFound } from "../../../../../services/stores/walmart.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"
import {
  WalmartBasketSchema,
  WalmartFoundSchema,
} from "../../../../schemas/walmart.ts"

const route = createRoute({
  method: "post",
  path: "/stores/walmart/found",
  operationId: "walmartFound",
  tags: ["Stores"],
  summary: "What the extension found at Walmart",
  description:
    "The products Merran's browser extension read from Walmart's search for things on the list. Every price is kept; each thing without a product of the household's own gets Merran's pick (the household's model for shopping when it has AI, else the first in stock), kept for its food. A product someone picked is never replaced, only brought up to date. The answer is the cart to look over.",
  ...openToKeys("list", "write"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: WalmartFoundSchema } },
    },
  },
  responses: {
    200: jsonResponse(WalmartBasketSchema, "Picked, and the cart as it is."),
    422: errorResponse("Walmart isn't turned on on this server."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    const { items } = c.req.valid("json")
    return c.json(
      await walmartFound(deps, em, { householdId, userId }, items),
      200
    )
  })
}

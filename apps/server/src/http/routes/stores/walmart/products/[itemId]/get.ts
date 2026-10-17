import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { walmartOptions } from "../../../../../../services/stores/walmart.ts"
import { inHousehold, openToKeys } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"
import { ItemParam } from "../../../../../schemas/stores.ts"
import { WalmartOptionsSchema } from "../../../../../schemas/walmart.ts"

const route = createRoute({
  method: "get",
  path: "/stores/walmart/products/{itemId}",
  operationId: "walmartOptions",
  tags: ["Stores"],
  summary: "What Walmart had for a thing on the list",
  description:
    "The products Walmart's search had for its food when Merran's browser extension last looked, to pick another from without looking again. Empty if it hasn't looked yet.",
  ...openToKeys("list", "read"),
  request: { params: ItemParam },
  responses: {
    200: jsonResponse(WalmartOptionsSchema, "What Walmart had."),
    404: errorResponse("Not on the list."),
    422: errorResponse("Walmart isn't turned on on this server."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    const { itemId } = c.req.valid("param")
    return c.json(await walmartOptions(deps, em, itemId), 200)
  })
}

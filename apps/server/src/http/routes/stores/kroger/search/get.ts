import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { searchKroger } from "../../../../../services/stores/basket.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"
import { ProductsSchema, SearchQuery } from "../../../../schemas/stores.ts"

const route = createRoute({
  method: "get",
  path: "/stores/kroger/search",
  operationId: "searchKroger",
  tags: ["Stores"],
  summary: "Search the household's Kroger store",
  description: "Up to twenty products, with today's prices, to pick another.",
  ...openToKeys("list", "read"),
  request: { query: SearchQuery },
  responses: {
    200: jsonResponse(ProductsSchema, "What the store has."),
    422: errorResponse("Kroger isn't set up, or the household has no store."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    const products = await searchKroger(deps, em, c.req.valid("query").q)
    return c.json({ products }, 200)
  })
}

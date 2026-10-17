import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import {
  describeDiscovery,
  findDiscovery,
} from "../../../../services/discover/discover.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { DiscoveryParam, DiscoverySchema } from "../../../schemas/discover.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/discover/{discoveryId}",
  operationId: "getDiscovery",
  tags: ["Discover"],
  summary: "A search",
  ...openToKeys("recipes", "read"),
  request: { params: DiscoveryParam },
  responses: {
    200: jsonResponse(DiscoverySchema, "The search, as far as it's got."),
    404: errorResponse("No such search."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    const discovery = await findDiscovery(em, c.req.valid("param").discoveryId)
    return c.json(describeDiscovery(discovery), 200)
  })
}

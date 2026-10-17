import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../core/context.ts"
import { listDiscoveries } from "../../../services/discover/discover.ts"
import { inHousehold, openToKeys } from "../../middleware/auth.ts"
import type { Router } from "../../router.ts"
import { DiscoveryListSchema } from "../../schemas/discover.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/discover",
  operationId: "listDiscoveries",
  tags: ["Discover"],
  summary: "Recent searches",
  description: "The household's last twelve searches, newest first.",
  ...openToKeys("recipes", "read"),
  responses: {
    200: jsonResponse(DiscoveryListSchema, "Its searches."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    return c.json({ searches: await listDiscoveries(em) }, 200)
  })
}

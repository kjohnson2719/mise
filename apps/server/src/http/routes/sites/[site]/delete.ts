import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { unfollowSite } from "../../../../services/sites/sites.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { errorResponse, SIGNED_IN_ERRORS } from "../../../schemas/responses.ts"
import { SiteParam } from "../../../schemas/sites.ts"

const route = createRoute({
  method: "delete",
  path: "/sites/{site}",
  operationId: "unfollowSite",
  tags: ["Sites"],
  summary: "Stop following a site",
  description: "Recipes imported from it stay in the library.",
  ...openToKeys("recipes", "write"),
  request: { params: SiteParam },
  responses: {
    204: { description: "Not following it any more." },
    404: errorResponse("The household doesn't follow that site."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    await unfollowSite(em, c.req.valid("param").site)
    return c.body(null, 204)
  })
}

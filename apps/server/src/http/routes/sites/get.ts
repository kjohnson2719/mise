import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../core/context.ts"
import { languageOf, listSites } from "../../../services/sites/sites.ts"
import { inHousehold, openToKeys } from "../../middleware/auth.ts"
import type { Router } from "../../router.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../schemas/responses.ts"
import { SiteListSchema } from "../../schemas/sites.ts"

const route = createRoute({
  method: "get",
  path: "/sites",
  operationId: "listSites",
  tags: ["Sites"],
  summary: "Followed recipe sites",
  description:
    "The recipe sites the household follows, oldest followed first, each with its newest recipes; and suggested sites it doesn't follow yet. Merran reads each site's feed every few hours.",
  ...openToKeys("recipes", "read"),
  responses: {
    200: jsonResponse(SiteListSchema, "Its sites."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    return c.json(
      await listSites(em, householdId, await languageOf(em, userId)),
      200
    )
  })
}

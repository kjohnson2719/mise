import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../core/context.ts"
import { followSite } from "../../../services/sites/sites.ts"
import { inHousehold, openToKeys } from "../../middleware/auth.ts"
import type { Router } from "../../router.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../schemas/responses.ts"
import { FollowedSiteSchema, FollowSiteSchema } from "../../schemas/sites.ts"

const route = createRoute({
  method: "post",
  path: "/sites",
  operationId: "followSite",
  tags: ["Sites"],
  summary: "Follow a recipe site",
  description:
    "By any page of the site, its RSS or Atom feed, or a suggestion. Merran finds the feed and reads it straight away when no one's read it lately, opening each new post a few seconds apart and keeping the recipes.",
  ...openToKeys("recipes", "write"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: FollowSiteSchema } },
    },
  },
  responses: {
    201: jsonResponse(FollowedSiteSchema, "Following it."),
    400: errorResponse("That isn't a link Merran can fetch."),
    409: errorResponse("The household follows it already."),
    422: errorResponse("No feed was found, or recipe sites are off."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const site = await followSite(
      deps,
      em,
      householdId,
      c.req.valid("json").url
    )
    return c.json(site, 201)
  })
}

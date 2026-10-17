import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../core/context.ts"
import { startDiscovery } from "../../../services/discover/discover.ts"
import { inHousehold, openToKeys } from "../../middleware/auth.ts"
import type { Router } from "../../router.ts"
import { DiscoverInputSchema, DiscoverySchema } from "../../schemas/discover.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/discover",
  operationId: "startDiscovery",
  tags: ["Discover"],
  summary: "Find new recipes online",
  description:
    'Searches the web for recipes that fit a theme ("cozy fall soups") and suit the household, in the background, with the household\'s model for finding recipes, which must be able to search the web. Merran opens each page and keeps those it can import. Follow it at `GET /discover/{discoveryId}`; one at a time for a household.',
  ...openToKeys("recipes", "write"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: DiscoverInputSchema } },
    },
  },
  responses: {
    202: jsonResponse(DiscoverySchema, "Searching."),
    409: errorResponse("A search is going already."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    const discovery = await startDiscovery(deps, em, {
      householdId,
      userId,
      theme: c.req.valid("json").theme,
    })
    return c.json(discovery, 202)
  })
}

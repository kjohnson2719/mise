import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { startDiscovery } from "../../../../../services/discover/discover.ts"
import { getCollection } from "../../../../../services/sites/collections.ts"
import { languageOf } from "../../../../../services/sites/sites.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { DiscoverySchema } from "../../../../schemas/discover.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"
import { CollectionParam } from "../../../../schemas/sites.ts"

const route = createRoute({
  method: "post",
  path: "/collections/{collection}/find",
  operationId: "findMoreForCollection",
  tags: ["Collections"],
  summary: "Find more for a collection",
  description:
    "Searches the web for more recipes in the collection's theme that suit the household, as `POST /discover` does, and keeps them with the collection (its `found`). Needs a model that can search the web.",
  ...openToKeys("recipes", "write"),
  request: { params: CollectionParam },
  responses: {
    202: jsonResponse(DiscoverySchema, "Searching."),
    404: errorResponse("No such collection."),
    409: errorResponse("A search is going already."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    const collection = await getCollection(
      em,
      householdId,
      await languageOf(em, userId),
      c.req.valid("param").collection
    )
    const discovery = await startDiscovery(deps, em, {
      householdId,
      userId,
      theme: collection.theme,
      collection: collection.id,
      avoid: collection.recipes.map((recipe) => recipe.name),
    })
    return c.json(discovery, 202)
  })
}

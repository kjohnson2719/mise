import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { getCollection } from "../../../../services/sites/collections.ts"
import { languageOf } from "../../../../services/sites/sites.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"
import { CollectionParam, CollectionSchema } from "../../../schemas/sites.ts"

const route = createRoute({
  method: "get",
  path: "/collections/{collection}",
  operationId: "getCollection",
  tags: ["Collections"],
  summary: "A starter collection",
  description:
    "Its recipes that suit the household, and what Find more found for it last.",
  ...openToKeys("recipes", "read"),
  request: { params: CollectionParam },
  responses: {
    200: jsonResponse(CollectionSchema, "The collection."),
    404: errorResponse("No such collection."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    const collection = await getCollection(
      em,
      householdId,
      await languageOf(em, userId),
      c.req.valid("param").collection
    )
    return c.json(collection, 200)
  })
}

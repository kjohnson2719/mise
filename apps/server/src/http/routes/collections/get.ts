import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../core/context.ts"
import { listCollections } from "../../../services/sites/collections.ts"
import { languageOf } from "../../../services/sites/sites.ts"
import { inHousehold, openToKeys } from "../../middleware/auth.ts"
import type { Router } from "../../router.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../schemas/responses.ts"
import { CollectionListSchema } from "../../schemas/sites.ts"

const route = createRoute({
  method: "get",
  path: "/collections",
  operationId: "listCollections",
  tags: ["Collections"],
  summary: "Starter collections",
  description:
    "Sets of recipes to start a library with, each filled from the recipe sites Merran reads by its own rule, around a few hand-picked classics. Only collections in season for the household, with at least four recipes that suit it.",
  ...openToKeys("recipes", "read"),
  responses: {
    200: jsonResponse(CollectionListSchema, "The collections."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    const collections = await listCollections(
      em,
      householdId,
      await languageOf(em, userId)
    )
    return c.json({ collections }, 200)
  })
}

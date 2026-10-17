import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { bulkRecipes } from "../../../../services/recipes/bulk.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import {
  BulkResultSchema,
  RecipeBulkInputSchema,
} from "../../../schemas/recipes.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/recipes/bulk",
  operationId: "bulkChangeRecipes",
  tags: ["Recipes"],
  summary: "Change several recipes at once",
  description:
    "Moves recipes to Recently deleted, or adds or takes off tags, up to 500 at a time. Ones that aren't there are skipped.",
  ...openToKeys("recipes", "write"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: RecipeBulkInputSchema } },
    },
  },
  responses: {
    200: jsonResponse(BulkResultSchema, "Done."),
    400: errorResponse("Nothing picked, or something else is off."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    return c.json(await bulkRecipes(em, householdId, c.req.valid("json")), 200)
  })
}

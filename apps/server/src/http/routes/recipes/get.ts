import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../core/context.ts"
import { listRecipes } from "../../../services/recipes/recipes.ts"
import { recipesOnSale } from "../../../services/stores/prices.ts"
import { inHousehold, openToKeys } from "../../middleware/auth.ts"
import type { Router } from "../../router.ts"
import {
  RecipeListQuerySchema,
  RecipeListSchema,
} from "../../schemas/recipes.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/recipes",
  operationId: "listRecipes",
  tags: ["Recipes"],
  summary: "Find recipes",
  description:
    "The household's recipes, a page at a time: searched, filtered by tags, and sorted.",
  ...openToKeys("recipes", "read"),
  request: { query: RecipeListQuerySchema },
  responses: {
    200: jsonResponse(RecipeListSchema, "The recipes that match."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const { onSale, ...query } = c.req.valid("query")
    return c.json(
      await listRecipes(em, {
        ...query,
        only: onSale ? await recipesOnSale(em, householdId) : undefined,
      }),
      200
    )
  })
}

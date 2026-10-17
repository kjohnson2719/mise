import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { getPairings } from "../../../../../services/recipes/pairings.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  RecipePairingsSchema,
  RecipeParam,
} from "../../../../schemas/recipes.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/recipes/{recipe}/pairings",
  operationId: "listPairings",
  tags: ["Recipes"],
  summary: "What a recipe goes with",
  description:
    "Recipes it pairs with, picked or by a whole tag, every recipe that adds up to, and the recipes it's offered with. Recipes in Recently deleted are left out.",
  ...openToKeys("recipes", "read"),
  request: { params: RecipeParam },
  responses: {
    200: jsonResponse(RecipePairingsSchema, "What it goes with."),
    404: errorResponse("No such recipe."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    return c.json(await getPairings(em, c.req.valid("param").recipe), 200)
  })
}

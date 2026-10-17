import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { addPairings } from "../../../../../services/recipes/pairings.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  PairingsInputSchema,
  RecipePairingsSchema,
  RecipeParam,
} from "../../../../schemas/recipes.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/recipes/{recipe}/pairings",
  operationId: "addPairings",
  tags: ["Recipes"],
  summary: "Add to what a recipe goes with",
  description:
    "Recipes, or every recipe with a tag, so new ones join by themselves. Ones it already goes with, and the recipe itself, are skipped.",
  ...openToKeys("recipes", "write"),
  request: {
    params: RecipeParam,
    body: {
      required: true,
      content: { "application/json": { schema: PairingsInputSchema } },
    },
  },
  responses: {
    200: jsonResponse(RecipePairingsSchema, "What it goes with now."),
    400: errorResponse("Nothing picked, or no tag by that name."),
    404: errorResponse("No such recipe, or one of those to pair isn't there."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const pairings = await addPairings(em, {
      householdId,
      recipe: c.req.valid("param").recipe,
      input: c.req.valid("json"),
    })
    return c.json(pairings, 200)
  })
}

import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { setNeeds } from "../../../../../services/recipes/recipes.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  NeedsInputSchema,
  RecipeParam,
  RecipeSchema,
} from "../../../../schemas/recipes.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "put",
  path: "/recipes/{recipe}/needs",
  operationId: "setRecipeNeeds",
  tags: ["Recipes"],
  summary: "Say what a recipe can't do without",
  description:
    "A food the household doesn't like is usually left out of recipes, crossed off and not bought. One a recipe can't do without rules that recipe out instead, as when tidy up marked it needed or, before tidy up, it's in the recipe's name. It isn't an edit, so no version is kept.",
  ...openToKeys("recipes", "write"),
  request: {
    params: RecipeParam,
    body: {
      required: true,
      content: { "application/json": { schema: NeedsInputSchema } },
    },
  },
  responses: {
    200: jsonResponse(RecipeSchema, "The recipe, with what it needs."),
    404: errorResponse("No such recipe."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    const recipe = await setNeeds(em, {
      recipe: c.req.valid("param").recipe,
      ...c.req.valid("json"),
    })
    return c.json(recipe, 200)
  })
}

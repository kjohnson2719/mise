import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { setDiets } from "../../../../../services/recipes/recipes.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  DietsInputSchema,
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
  path: "/recipes/{recipe}/diets",
  operationId: "setRecipeDiets",
  tags: ["Recipes"],
  summary: "Correct a recipe's diet labels",
  description:
    "The labels are worked out from the ingredients. Corrections that differ from them are kept, and stick when the recipe is edited. It isn't an edit, so no version is kept.",
  ...openToKeys("recipes", "write"),
  request: {
    params: RecipeParam,
    body: {
      required: true,
      content: { "application/json": { schema: DietsInputSchema } },
    },
  },
  responses: {
    200: jsonResponse(RecipeSchema, "The recipe, with its labels."),
    400: errorResponse("A label Merran doesn't know."),
    404: errorResponse("No such recipe."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    const recipe = await setDiets(em, {
      recipe: c.req.valid("param").recipe,
      overrides: c.req.valid("json").overrides,
    })
    return c.json(recipe, 200)
  })
}

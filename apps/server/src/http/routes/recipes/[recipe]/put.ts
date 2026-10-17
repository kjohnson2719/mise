import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { updateRecipe } from "../../../../services/recipes/recipes.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import {
  RecipeInputSchema,
  RecipeParam,
  RecipeSchema,
} from "../../../schemas/recipes.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"

const route = createRoute({
  method: "put",
  path: "/recipes/{recipe}",
  operationId: "updateRecipe",
  tags: ["Recipes"],
  summary: "Change a recipe",
  description:
    "Replaces the whole recipe, as the editor saves it. The recipe as it was is kept as a version, so the change can be undone; its slug stays the same.",
  ...openToKeys("recipes", "write"),
  request: {
    params: RecipeParam,
    body: {
      required: true,
      content: { "application/json": { schema: RecipeInputSchema } },
    },
  },
  responses: {
    200: jsonResponse(RecipeSchema, "Saved."),
    400: errorResponse("Something isn't right, field by field."),
    404: errorResponse("No such recipe."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    const recipe = await updateRecipe(em, {
      householdId,
      userId,
      recipe: c.req.valid("param").recipe,
      input: c.req.valid("json"),
    })
    return c.json(recipe, 200)
  })
}

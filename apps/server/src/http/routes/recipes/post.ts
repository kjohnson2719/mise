import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../core/context.ts"
import { createRecipe } from "../../../services/recipes/recipes.ts"
import { inHousehold, openToKeys } from "../../middleware/auth.ts"
import type { Router } from "../../router.ts"
import { RecipeInputSchema, RecipeSchema } from "../../schemas/recipes.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/recipes",
  operationId: "createRecipe",
  tags: ["Recipes"],
  summary: "Add a recipe",
  description:
    'Ingredients and steps are lines, one each, as typed in the editor; a line starting with "#" starts a section. Each ingredient line is read into its amount, unit, food and note.',
  ...openToKeys("recipes", "write"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: RecipeInputSchema } },
    },
  },
  responses: {
    201: jsonResponse(RecipeSchema, "Added."),
    400: errorResponse("Something isn't right, field by field."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    const recipe = await createRecipe(em, {
      householdId,
      userId,
      input: c.req.valid("json"),
    })
    return c.json(recipe, 201)
  })
}

import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { clearPhoto } from "../../../../../services/recipes/recipes.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { RecipeParam, RecipeSchema } from "../../../../schemas/recipes.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "delete",
  path: "/recipes/{recipe}/photo",
  operationId: "deleteRecipePhoto",
  tags: ["Recipes"],
  summary: "Take a recipe's photo away",
  description: "The photo is deleted.",
  ...openToKeys("recipes", "write"),
  request: { params: RecipeParam },
  responses: {
    200: jsonResponse(RecipeSchema, "The recipe, without a photo."),
    404: errorResponse("No such recipe."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { files }: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const recipe = await clearPhoto(em, files, {
      householdId,
      recipe: c.req.valid("param").recipe,
    })
    return c.json(recipe, 200)
  })
}

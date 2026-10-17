import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { makePhoto } from "../../../../../../services/ai-photos/ai-photos.ts"
import { inHousehold, openToKeys } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import { RecipeParam, RecipeSchema } from "../../../../../schemas/recipes.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/recipes/{recipe}/photo/make",
  operationId: "makeRecipePhoto",
  tags: ["Recipes"],
  summary: "Make a photo with AI",
  description:
    "A photo of the finished dish in the household's style, on its OpenAI or Google key: for a recipe without a photo, or in place of one made by AI before. It takes up to a minute.",
  ...openToKeys("recipes", "write"),
  request: { params: RecipeParam },
  responses: {
    200: jsonResponse(RecipeSchema, "The recipe, with its new photo."),
    404: errorResponse("No such recipe."),
    409: errorResponse("It has a real photo, which an AI one never replaces."),
    422: errorResponse(
      "AI photos are off on the server, or the household has no key for them."
    ),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    const recipe = await makePhoto(deps, em, {
      householdId,
      userId,
      recipe: c.req.valid("param").recipe,
    })
    return c.json(recipe, 200)
  })
}

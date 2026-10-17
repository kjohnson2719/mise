import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../../core/context.ts"
import {
  findRecipe,
  updateRecipe,
} from "../../../../../../../services/recipes/recipes.ts"
import { versionSnapshot } from "../../../../../../../services/recipes/versions.ts"
import { inHousehold, openToKeys } from "../../../../../../middleware/auth.ts"
import type { Router } from "../../../../../../router.ts"
import {
  RecipeSchema,
  VersionParam,
} from "../../../../../../schemas/recipes.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/recipes/{recipe}/versions/{versionId}/restore",
  operationId: "restoreRecipeVersion",
  tags: ["Recipes"],
  summary: "Go back to a version",
  description:
    "Makes the recipe what it was in that version. How it is now is kept as a version too, so this can be undone as well.",
  ...openToKeys("recipes", "write"),
  request: { params: VersionParam },
  responses: {
    200: jsonResponse(RecipeSchema, "The recipe, as it was."),
    404: errorResponse("No such recipe or version."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    const params = c.req.valid("param")
    const recipe = await findRecipe(em, params.recipe)
    const snapshot = await versionSnapshot(em, recipe.id, params.versionId)
    const restored = await updateRecipe(em, {
      householdId,
      userId,
      recipe: recipe.id,
      input: snapshot,
      source: "restore",
    })
    return c.json(restored, 200)
  })
}

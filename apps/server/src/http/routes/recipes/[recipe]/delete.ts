import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { KEEP_DELETED_DAYS } from "../../../../services/recipes/deleted.ts"
import { moveToDeleted } from "../../../../services/recipes/recipes.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { RecipeParam } from "../../../schemas/recipes.ts"
import { errorResponse, SIGNED_IN_ERRORS } from "../../../schemas/responses.ts"

const route = createRoute({
  method: "delete",
  path: "/recipes/{recipe}",
  operationId: "deleteRecipe",
  tags: ["Recipes"],
  summary: "Delete a recipe",
  description: `Moves it to Recently deleted, where it can be put back for ${KEEP_DELETED_DAYS} days.`,
  ...openToKeys("recipes", "write"),
  request: { params: RecipeParam },
  responses: {
    204: { description: "Moved to Recently deleted." },
    404: errorResponse("No such recipe."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    await moveToDeleted(em, c.req.valid("param").recipe)
    return c.body(null, 204)
  })
}

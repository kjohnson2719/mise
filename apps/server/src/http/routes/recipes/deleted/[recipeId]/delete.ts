import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { deleteForGood } from "../../../../../services/recipes/deleted.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { DeletedRecipeParam } from "../../../../schemas/recipes.ts"
import {
  errorResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "delete",
  path: "/recipes/deleted/{recipeId}",
  operationId: "purgeRecipe",
  tags: ["Recipes"],
  summary: "Delete a recipe for good",
  description: "Only for a recipe in Recently deleted. This can't be undone.",
  ...openToKeys("recipes", "write"),
  request: { params: DeletedRecipeParam },
  responses: {
    204: { description: "Deleted for good." },
    404: errorResponse("No such recipe in Recently deleted."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { files }: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    await deleteForGood(em, files, c.req.valid("param").recipeId)
    return c.body(null, 204)
  })
}

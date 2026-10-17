import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { cookedToday } from "../../../../../services/plan/plan.ts"
import {
  findRecipe,
  loadRecipe,
  markMade,
} from "../../../../../services/recipes/recipes.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { RecipeParam, RecipeSchema } from "../../../../schemas/recipes.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/recipes/{recipe}/made",
  operationId: "markRecipeMade",
  tags: ["Recipes"],
  summary: "Mark a recipe made",
  description:
    "The recipe was made now: today's meal of it on the plan is marked cooked (or, failing that, one in this week's pool becomes today's, cooked), and its `lastMadeAt` is set. Marking that meal not cooked again puts `lastMadeAt` back. It isn't an edit, so no version is kept.",
  ...openToKeys("recipes", "write"),
  request: { params: RecipeParam },
  responses: {
    200: jsonResponse(RecipeSchema, "The recipe, made now."),
    404: errorResponse("No such recipe."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const { id } = await findRecipe(em, c.req.valid("param").recipe)
    // A meal of it cooked says it was made; with none, it was made off the plan.
    const cooked = await cookedToday(em, householdId, id)
    const recipe =
      cooked > 0 ? await loadRecipe(em, id) : await markMade(em, { recipe: id })
    return c.json(recipe, 200)
  })
}

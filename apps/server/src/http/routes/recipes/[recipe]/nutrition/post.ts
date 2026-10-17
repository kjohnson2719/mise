import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { workOutNutrition } from "../../../../../services/nutrition/nutrition.ts"
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
  path: "/recipes/{recipe}/nutrition",
  operationId: "workOutNutrition",
  tags: ["Recipes"],
  summary: "Work out a recipe's nutrition",
  description:
    "Per serving, from the ingredients: added up from USDA FoodData Central when the server has a key (AI picking each ingredient's food and weighing what USDA's portions can't), else, or when too much couldn't be counted, estimated by AI. Replaces what it had, from the site too. A recipe's nutrition is worked out by itself after it's saved; this is for doing it again now.",
  ...openToKeys("recipes", "write"),
  request: { params: RecipeParam },
  responses: {
    200: jsonResponse(RecipeSchema, "The recipe, with its nutrition."),
    400: errorResponse("No servings, or no ingredients."),
    404: errorResponse("No such recipe."),
    422: errorResponse(
      "No USDA key on the server, and no AI for the household."
    ),
    429: errorResponse("USDA's limit for the hour, or this month's AI limit."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    const recipe = await workOutNutrition(deps, em, {
      householdId,
      userId,
      recipe: c.req.valid("param").recipe,
    })
    return c.json(recipe, 200)
  })
}

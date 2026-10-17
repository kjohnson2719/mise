import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { nutritionLibrary } from "../../../../services/nutrition/runs.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { NutritionLibrarySchema } from "../../../schemas/nutrition.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/recipes/nutrition",
  operationId: "getNutritionLibrary",
  tags: ["Recipes"],
  summary: "Nutrition across the library",
  description:
    "How many recipes have no nutrition yet, how many need servings first, and the latest run working it out.",
  ...openToKeys("recipes", "read"),
  responses: {
    200: jsonResponse(NutritionLibrarySchema, "The library."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    return c.json(await nutritionLibrary(em, householdId), 200)
  })
}

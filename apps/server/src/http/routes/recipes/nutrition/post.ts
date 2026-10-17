import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { AppError } from "../../../../core/errors.ts"
import {
  describeNutritionRun,
  startNutritionRun,
} from "../../../../services/nutrition/runs.ts"
import { nutritionAbilities } from "../../../../services/nutrition/nutrition.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { NutritionRunSchema } from "../../../schemas/nutrition.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/recipes/nutrition",
  operationId: "startNutritionRun",
  tags: ["Recipes"],
  summary: "Work out nutrition for the library",
  description:
    "Every recipe with servings and ingredients but no nutrition, in the background, two at a time: from USDA's data when the server has a key, else estimated by AI. USDA's hourly limit pauses it rather than ending it. One at a time: starting another gives back the one going.",
  ...openToKeys("recipes", "write"),
  responses: {
    202: jsonResponse(NutritionRunSchema, "Started."),
    400: errorResponse("Every recipe with servings has its nutrition."),
    422: errorResponse(
      "No USDA key on the server, and no AI for the household."
    ),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    const can = await nutritionAbilities(deps, em, householdId)
    if (!can.usdaKey && !can.ai) {
      throw new AppError(
        "unprocessable",
        "nutrition_unavailable",
        "Working out nutrition needs a USDA key on the server, or AI for the household."
      )
    }
    const job = await startNutritionRun(em, { householdId, userId })
    return c.json(describeNutritionRun(job), 202)
  })
}

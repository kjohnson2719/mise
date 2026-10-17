import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { saveSwap } from "../../../../../services/recipes/swaps.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { RecipeParam } from "../../../../schemas/recipes.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"
import {
  SavedSwapSchema,
  SaveSwapInputSchema,
} from "../../../../schemas/swaps.ts"

const route = createRoute({
  method: "post",
  path: "/recipes/{recipe}/swap",
  operationId: "saveSwap",
  tags: ["Recipes"],
  summary: "Swap an ingredient in a recipe for good",
  description:
    "Puts lines in an ingredient's place, and rewrites the steps given, as one change that keeps a version of how it was. The answer has that version's id, to restore to undo it.",
  ...openToKeys("recipes", "write"),
  request: {
    params: RecipeParam,
    body: {
      required: true,
      content: { "application/json": { schema: SaveSwapInputSchema } },
    },
  },
  responses: {
    200: jsonResponse(SavedSwapSchema, "Swapped."),
    400: errorResponse("No lines, or too many."),
    404: errorResponse("No such recipe."),
    409: errorResponse(
      "The recipe changed since: the ingredient or a step is gone."
    ),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    const result = await saveSwap(em, {
      householdId,
      userId,
      recipe: c.req.valid("param").recipe,
      ...c.req.valid("json"),
    })
    return c.json(result, 200)
  })
}

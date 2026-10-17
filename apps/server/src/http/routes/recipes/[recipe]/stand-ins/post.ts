import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { suggestSwaps } from "../../../../../services/recipes/swaps.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { RecipeParam } from "../../../../schemas/recipes.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"
import { StandInInputSchema, SwapsSchema } from "../../../../schemas/swaps.ts"

const route = createRoute({
  method: "post",
  path: "/recipes/{recipe}/stand-ins",
  operationId: "suggestStandIns",
  tags: ["Recipes"],
  summary: "Stand-ins for an ingredient",
  description:
    "For an ingredient someone's out of, or doesn't eat: two to four stand-ins that work in this recipe, with amounts for the recipe as written, what's in the pantry first, and nothing the household avoids or that's against its diets. Each says how to use it, and rewrites any step it changes. Nothing is saved; use `POST /recipes/{recipe}/swap` to put one in the recipe. Uses the household's model for swaps, and counts towards its AI spend.",
  ...openToKeys("recipes", "write"),
  request: {
    params: RecipeParam,
    body: {
      required: true,
      content: { "application/json": { schema: StandInInputSchema } },
    },
  },
  responses: {
    200: jsonResponse(SwapsSchema, "Stand-ins, best first; maybe none."),
    404: errorResponse("No such recipe, or no such ingredient in it."),
    429: errorResponse("This month's AI limit is reached, or the AI is busy."),
    502: errorResponse("The AI provider failed."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    const swaps = await suggestSwaps(deps, em, {
      householdId,
      userId,
      recipe: c.req.valid("param").recipe,
      ingredientId: c.req.valid("json").ingredientId,
    })
    return c.json({ swaps }, 200)
  })
}

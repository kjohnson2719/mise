import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { recipeProposal } from "../../../../../services/recipes/review/proposals.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { RecipeParam } from "../../../../schemas/recipes.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"
import { RecipeProposalSchema } from "../../../../schemas/tidy.ts"

const route = createRoute({
  method: "get",
  path: "/recipes/{recipe}/tidy",
  operationId: "getRecipeTidy",
  tags: ["Review"],
  summary: "A recipe's waiting tidy up",
  description:
    "The tidy up waiting in the Review queue for this recipe, or null when there's none.",
  ...openToKeys("recipes", "read"),
  request: { params: RecipeParam },
  responses: {
    200: jsonResponse(RecipeProposalSchema, "Its suggestion, or null."),
    404: errorResponse("No such recipe."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    const proposal = await recipeProposal(em, c.req.valid("param").recipe)
    return c.json({ proposal }, 200)
  })
}

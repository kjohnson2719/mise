import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { AppError } from "../../../../../core/errors.ts"
import { proposeTidy } from "../../../../../services/recipes/review/tidy.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { RecipeParam } from "../../../../schemas/recipes.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"
import {
  RecipeProposalSchema,
  TidyInputSchema,
} from "../../../../schemas/tidy.ts"

const route = createRoute({
  method: "post",
  path: "/recipes/{recipe}/tidy",
  operationId: "tidyRecipe",
  tags: ["Review"],
  summary: "Tidy up a recipe",
  description:
    "AI tidies the recipe: consistent ingredient lines, short clear steps, tags from the household's own, a description and servings and times when they're missing, and marks on what it can do without. Nothing changes yet: the suggestion waits in the Review queue, in place of any earlier one for the recipe, and comes back here. Null when there's nothing to change. Uses the household's model for tidying, and counts towards its AI spend.",
  ...openToKeys("recipes", "write"),
  request: {
    params: RecipeParam,
    body: {
      required: false,
      content: { "application/json": { schema: TidyInputSchema } },
    },
  },
  responses: {
    200: jsonResponse(RecipeProposalSchema, "Its suggestion, or null."),
    404: errorResponse("No such recipe."),
    422: errorResponse("The model can't do it."),
    429: errorResponse("This month's AI limit is reached, or the AI is busy."),
    502: errorResponse("The AI provider failed."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    // The body is optional: without one, every section.
    const body = TidyInputSchema.safeParse(await c.req.json().catch(() => ({})))
    if (!body.success) {
      throw new AppError(
        "invalid",
        "invalid_sections",
        "Those aren't sections tidy up knows."
      )
    }
    const { sections } = body.data
    const proposal = await proposeTidy(deps, em, {
      householdId,
      userId,
      recipe: c.req.valid("param").recipe,
      sections,
    })
    return c.json({ proposal }, 200)
  })
}

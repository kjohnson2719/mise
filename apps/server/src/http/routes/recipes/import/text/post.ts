import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { importText } from "../../../../../services/recipes/import/import-with-ai.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { RecipeSchema } from "../../../../schemas/recipes.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const TextImportSchema = z
  .object({
    text: z
      .string()
      .trim()
      .min(1, "Paste the recipe's text.")
      .max(50_000, "That's too long for one recipe. Paste just the recipe."),
    sourceUrl: z
      .union([
        z.url({
          protocol: /^https?$/,
          error: "Use a full link, starting with https://",
        }),
        z.literal(""),
      ])
      .nullish()
      .transform((value) => value || null)
      .openapi({ description: "Where it's from, when that's a page." }),
  })
  .openapi("TextImport", {
    example: {
      text: "Lemon Chicken\n\n4 chicken thighs\n2 lemons, juiced\n1 tsp salt\n\nRub the chicken with lemon and salt. Roast at 200°C for 40 minutes.",
      sourceUrl: null,
    },
  })

const route = createRoute({
  method: "post",
  path: "/recipes/import/text",
  operationId: "importRecipeText",
  tags: ["Recipes"],
  summary: "Add a recipe from text",
  description:
    "Text with a recipe in it, from an email, a note or a message, read by AI and added as a recipe. Uses the household's model for importing, and counts towards its AI spend.",
  ...openToKeys("recipes", "write"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: TextImportSchema } },
    },
  },
  responses: {
    201: jsonResponse(RecipeSchema, "Added."),
    400: errorResponse("No text, or too much."),
    422: errorResponse("No recipe found in it."),
    429: errorResponse("This month's AI limit is reached, or the AI is busy."),
    502: errorResponse("The AI provider failed."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    const { text, sourceUrl } = c.req.valid("json")
    const recipe = await importText(em, deps, {
      householdId,
      userId,
      text,
      sourceUrl,
    })
    return c.json(recipe, 201)
  })
}

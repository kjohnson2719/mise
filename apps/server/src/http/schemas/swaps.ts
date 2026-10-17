import { z } from "@hono/zod-openapi"
import { IDS, RECIPE } from "./examples.ts"
import { RecipeSchema } from "./recipes.ts"

const SWAP = {
  lines: ["1 cup Greek yogurt"],
  note: "Stir in off the heat so it doesn't split; a little tangier.",
  atHome: true,
  steps: [] as { stepId: string; text: string }[],
}

const StepChangeSchema = z.object({
  stepId: z.string(),
  text: z.string().max(5000).openapi({ description: "The step, rewritten." }),
})

export const SwapSchema = z
  .object({
    lines: z.array(z.string()).openapi({
      description:
        "Ingredient lines in its place, with amounts for the recipe as written.",
    }),
    note: z.string().openapi({
      description: "How to use it, and how it changes the dish.",
    }),
    atHome: z.boolean().openapi({ description: "It's in the pantry." }),
    steps: z.array(StepChangeSchema).openapi({
      description: "Steps it changes, rewritten. Usually none.",
    }),
  })
  .openapi("Swap", { example: SWAP })

export const SwapsSchema = z
  .object({ swaps: z.array(SwapSchema) })
  .openapi("Swaps", { example: { swaps: [SWAP] } })

export const StandInInputSchema = z
  .object({
    ingredientId: z.string().openapi({ example: IDS.ingredients[1] }),
  })
  .openapi("StandInInput", { example: { ingredientId: IDS.ingredients[1] } })

export const SaveSwapInputSchema = z
  .object({
    ingredientId: z.string(),
    lines: z
      .array(z.string().trim().min(1).max(500))
      .min(1, "Give at least one line.")
      .max(5, "Use 5 lines or fewer."),
    steps: z.array(StepChangeSchema).max(20).optional(),
  })
  .openapi("SaveSwapInput", {
    example: {
      ingredientId: IDS.ingredients[1],
      lines: ["1 tbsp butter"],
      steps: [],
    },
  })

export const SavedSwapSchema = z
  .object({
    recipe: RecipeSchema,
    undoVersionId: z.string().nullable().openapi({
      description:
        "The version of the recipe as it was, to restore to undo the swap.",
    }),
  })
  .openapi("SavedSwap", {
    example: { recipe: RECIPE, undoVersionId: IDS.version },
  })

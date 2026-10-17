import { AVOID_LEVELS, DIETS, MEALS } from "@merran/shared"
import { z } from "zod"

// What a proposal from the assistant holds, by kind, when it isn't changes
// to a recipe's sections. Checked again when it's applied.

const RecipeRef = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
})

export const MealsPayload = z.object({
  meals: z.array(
    z.object({
      date: z.string(),
      meal: z.enum(MEALS),
      recipe: RecipeRef.nullable(),
      /** A recipe it goes with, like a sauce. */
      with: RecipeRef.nullable(),
      note: z.string().nullable(),
      servings: z.number().nullable(),
    })
  ),
})
export type MealsPayload = z.infer<typeof MealsPayload>

export const ListPayload = z.object({ items: z.array(z.string()) })
export type ListPayload = z.infer<typeof ListPayload>

export const TastesPayload = z.object({
  avoid: z.array(
    z.object({
      food: z.string(),
      level: z.enum(AVOID_LEVELS),
      who: z.string().nullable(),
    })
  ),
  diets: z.array(z.enum(DIETS)),
  weeknightMinutes: z.number().nullable(),
})
export type TastesPayload = z.infer<typeof TastesPayload>

export const SwapPayload = z.object({
  /** The line it stands in for, and what it said. */
  ingredientId: z.string(),
  insteadOf: z.string(),
  lines: z.array(z.string()),
  note: z.string(),
  /** Steps it changes, rewritten. */
  steps: z.array(z.object({ stepId: z.string(), text: z.string() })),
})
export type SwapPayload = z.infer<typeof SwapPayload>

export const ImportPayload = z.object({
  url: z.string(),
  name: z.string(),
  site: z.string(),
  photo: z.string().nullable(),
  minutes: z.number().nullable(),
  why: z.string(),
})
export type ImportPayload = z.infer<typeof ImportPayload>

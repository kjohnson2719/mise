import type { IngredientMark } from "./marks.ts"

// Tidy up: what it can change about a recipe, a section at a time. Each
// section of a suggestion is applied or skipped on its own.

/**
 * - ingredients: consistent amounts and units, combined lines split
 * - steps: short and clear, filler taken out, the method unchanged
 * - tags: from the household's own tags first
 * - description: one, when there isn't one
 * - details: servings and times, when they're missing
 * - marks: what it can do without, ingredient by ingredient
 * - foods: the food a line is, for lines Merran doesn't know
 */
export const TIDY_SECTIONS = [
  "ingredients",
  "steps",
  "tags",
  "description",
  "details",
  "marks",
  "foods",
] as const
export type TidySection = (typeof TIDY_SECTIONS)[number]

/**
 * What any suggestion can change: tidy up's sections, and the notes, which
 * a cooking note can add to.
 */
export const PROPOSAL_SECTIONS = [...TIDY_SECTIONS, "notes"] as const
export type ProposalSection = (typeof PROPOSAL_SECTIONS)[number]

/** A suggestion's state: waiting in Review, applied, or dismissed. */
export const PROPOSAL_STATUSES = ["pending", "applied", "dismissed"] as const
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number]

/** Servings and times, the details tidy up fills in when they're missing. */
export type RecipeDetails = {
  servings: number | null
  prepMinutes: number | null
  cookMinutes: number | null
  totalMinutes: number | null
}

/** An ingredient line and what it is to the dish; null when not marked. */
export type MarkedLine = { line: string; mark: IngredientMark | null }

/**
 * An ingredient line and the food someone said it is (a food key), for a
 * line Merran doesn't know; null when no one has.
 */
export type FoodLine = { line: string; food: string | null }

/**
 * A recipe's sections as a suggestion has them, before or after: only the
 * ones it changes. Ingredients and steps are editor lines ("# Sauce" starts
 * a section).
 */
export type TidyValues = {
  ingredients?: string[]
  steps?: string[]
  tags?: string[]
  description?: string | null
  details?: RecipeDetails
  marks?: MarkedLine[]
  foods?: FoodLine[]
  notes?: string | null
}

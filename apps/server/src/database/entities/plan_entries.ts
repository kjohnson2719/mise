import { MEALS, type MealShare, type Reason } from "@merran/shared"
import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { householdFilter } from "../scope.ts"
import { createdAt, day, id, updatedAt } from "./base.ts"
import { householdRef } from "./households.ts"
import { Recipe } from "./recipes.ts"

// The meals a household can plan; shared with the web app.
export { MEALS }
export const PLAN_STATUSES = ["planned", "cooked", "skipped"] as const

/**
 * What cooking a meal took from the pantry, to put back if it wasn't
 * cooked: how much of each thing (all of it, when it was used up), and
 * what was set aside for the meal.
 */
export type PantrySnapshot = {
  id: string
  foodKey: string
  name: string
  /** How much was taken. */
  quantity: number | null
  unit: string | null
  amountText: string | null
  aisle: string | null
  storedIn: "fridge" | "freezer" | "cupboard" | null
  useBy: string | null
  /** What was set aside for the meal, set aside again when it's put back. */
  share: MealShare | null
  /** Used up, so it went from the pantry. */
  removed: boolean
  createdAt: string
}[]

/**
 * A meal on the plan: a recipe or a note ("leftovers"), on a day. A meal in
 * the week's pool belongs to the week rather than a day: `date` is the
 * week's first day and `anyDay` is true.
 */
export const PlanEntry = defineEntity({
  name: "PlanEntry",
  tableName: "plan_entries",
  properties: {
    id: id(),
    household: () => householdRef(),
    date: day(),
    anyDay: p.boolean().default(false),
    meal: p.enum(MEALS),
    position: p.integer().default(0),
    recipe: () => p.manyToOne(Recipe).ref().nullable().deleteRule("cascade"),
    /** What it's made with ("with peanut sauce"). */
    withRecipe: () =>
      p.manyToOne(Recipe).ref().nullable().deleteRule("set null"),
    note: p.text().nullable(),
    /** None means the recipe's own servings. */
    servings: p.double().nullable(),
    status: p.enum(PLAN_STATUSES).default("planned"),
    /** When it was marked cooked: its recipe and side were made then. */
    cookedAt: p.datetime().nullable(),
    /** When its ingredients went on the list. */
    listedAt: p.datetime().nullable(),
    pantryUsed: p.json<PantrySnapshot>().nullable(),
    /** Why it was picked, when Fill the week or the autoplan picked it. */
    why: p.json<Reason[]>().nullable(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  indexes: [{ properties: ["household", "date"] }],
  filters: householdFilter,
})
export type PlanEntry = InferEntity<typeof PlanEntry>

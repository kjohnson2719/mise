import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { householdFilter, notDeletedFilter } from "../scope.ts"
import { createdAt, id, updatedAt } from "./base.ts"
import { householdRef } from "./households.ts"
import { RecipeIngredient } from "./recipe_ingredients.ts"
import { RecipeStep } from "./recipe_steps.ts"
import { User } from "./users.ts"

export const RECIPE_ORIGINS = [
  "link",
  "video",
  "text",
  "photo",
  "manual",
  "assistant",
  "mealie",
  "paprika",
  "merran",
] as const

export type NutritionSource = "site" | "calculated" | "estimate"

/** Per serving. */
export type Nutrition = {
  source: NutritionSource
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
  fiber?: number
  sugar?: number
  sodium?: number
  /** Ingredient lines that couldn't be counted. */
  missing?: string[]
  /** The servings it was worked out for, so a change of servings rescales it. */
  servings?: number
}

export const Recipe = defineEntity({
  name: "Recipe",
  tableName: "recipes",
  properties: {
    id: id(),
    household: () => householdRef(),
    /** Unique in the household, for addresses like /recipes/lemon-chicken. */
    slug: p.string(),
    name: p.string(),
    description: p.text().nullable(),
    image: p.string().nullable(),
    imageByAi: p.boolean().default(false),
    sourceUrl: p.text().nullable(),
    servings: p.double().nullable(),
    yieldText: p.string().nullable(),
    prepMinutes: p.integer().nullable(),
    cookMinutes: p.integer().nullable(),
    totalMinutes: p.integer().nullable(),
    notes: p.text().nullable(),
    /** 1 to 5. */
    rating: p.smallint().nullable(),
    nutrition: p.json<Nutrition>().nullable(),
    /** The household's corrections to the diet labels worked out from the ingredients. */
    dietOverrides: p.json<Record<string, boolean>>().nullable(),
    /**
     * Foods the household said it can't do without, so a dislike that's
     * usually left out rules it out instead.
     */
    needs: p.json<string[]>().nullable(),
    /**
     * The diet labels, corrections and all, as ",vegetarian,gluten-free,":
     * worked out whenever the ingredients change, and found with `like`.
     */
    diets: p.string().default(""),
    origin: p.enum(RECIPE_ORIGINS),
    /**
     * Where an import from another app brought it from, like "mealie:<id>",
     * so importing the same thing again skips it.
     */
    importedFrom: p.string().nullable(),
    /**
     * When it was last made: the latest of its cooked meals on the plan
     * (as the recipe or the side) and `madeOffPlanAt`. Worked out again
     * whenever a meal of it is cooked, or stops being cooked.
     */
    lastMadeAt: p.datetime().nullable(),
    /**
     * When it was last made with no meal of it on the plan to mark cooked:
     * "I made this" with none planned, or another app's date on import.
     */
    madeOffPlanAt: p.datetime().nullable(),
    /** When tidy up last looked at it, whatever it found: library runs skip it. */
    tidiedAt: p.datetime().nullable(),
    /** Set while the recipe is in Recently deleted. */
    deletedAt: p.datetime().nullable().index(),
    createdBy: () => p.manyToOne(User).ref().nullable().deleteRule("set null"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    // Replacing a recipe's lines deletes the ones it no longer has.
    ingredients: () =>
      p
        .oneToMany(RecipeIngredient)
        .mappedBy("recipe")
        .orderBy({ position: "asc" })
        .orphanRemoval(),
    steps: () =>
      p
        .oneToMany(RecipeStep)
        .mappedBy("recipe")
        .orderBy({ position: "asc" })
        .orphanRemoval(),
  },
  uniques: [{ properties: ["household", "slug"] }],
  indexes: [
    { properties: ["household", "sourceUrl"] },
    { properties: ["household", "importedFrom"] },
  ],
  filters: { ...householdFilter, ...notDeletedFilter },
})
export type Recipe = InferEntity<typeof Recipe>

/** The `recipe` property of a recipe's lines, steps and the like. */
export const recipeRef = () =>
  p.manyToOne(Recipe).ref().deleteRule("cascade").index()

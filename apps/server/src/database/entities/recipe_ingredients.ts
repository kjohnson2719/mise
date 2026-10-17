import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { INGREDIENT_MARKS, type FoodSource } from "@merran/shared"
import { householdFilter } from "../scope.ts"
import { id } from "./base.ts"
import { householdRef } from "./households.ts"
import { recipeRef } from "./recipes.ts"

/**
 * One ingredient line. `rawText` is the line as written and is what's shown;
 * the parsed fields drive scaling, the list, the pantry and nutrition.
 */
export const RecipeIngredient = defineEntity({
  name: "RecipeIngredient",
  tableName: "recipe_ingredients",
  properties: {
    id: id(),
    household: () => householdRef(),
    recipe: () => recipeRef(),
    position: p.integer(),
    /** "For the sauce", or none. */
    section: p.string().nullable(),
    rawText: p.text(),
    quantity: p.double().nullable(),
    /** The top of a range ("2 to 3 cloves"). */
    quantityMax: p.double().nullable(),
    unit: p.string().nullable(),
    food: p.string().nullable(),
    note: p.text().nullable(),
    /**
     * What it is to the dish, as tidy up marked it: needed, swappable or
     * optional. Leaving out a dislike goes by it. None until marked.
     */
    mark: p.enum(INGREDIENT_MARKS).nullable(),
    /**
     * The food a person or AI said the line is, winning over the
     * vocabulary when the list is made. None when the vocabulary's is it.
     */
    foodKey: p.string().nullable(),
    /** Who said: "person" or "ai" (see `FOOD_SOURCES`). Text, not an enum. */
    foodSource: p.string().$type<FoodSource>().nullable(),
  },
  filters: householdFilter,
})
export type RecipeIngredient = InferEntity<typeof RecipeIngredient>

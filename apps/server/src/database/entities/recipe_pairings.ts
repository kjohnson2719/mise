import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { householdFilter } from "../scope.ts"
import { createdAt, id } from "./base.ts"
import { householdRef } from "./households.ts"
import { Recipe, recipeRef } from "./recipes.ts"

/**
 * "Goes with": a recipe pairs with one other recipe, or with every recipe
 * that has a tag, so new sauces join by themselves.
 */
export const RecipePairing = defineEntity({
  name: "RecipePairing",
  tableName: "recipe_pairings",
  properties: {
    id: id(),
    household: () => householdRef(),
    recipe: () => recipeRef(),
    pairedRecipe: () =>
      p.manyToOne(Recipe).ref().nullable().deleteRule("cascade"),
    /** A tag's name key, when the pairing is with a whole tag. */
    tagKey: p.string().nullable(),
    createdAt: createdAt(),
  },
  filters: householdFilter,
})
export type RecipePairing = InferEntity<typeof RecipePairing>

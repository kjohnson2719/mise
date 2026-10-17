import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { householdFilter } from "../scope.ts"
import { id } from "./base.ts"
import { householdRef } from "./households.ts"
import { recipeRef } from "./recipes.ts"

export const RecipeStep = defineEntity({
  name: "RecipeStep",
  tableName: "recipe_steps",
  properties: {
    id: id(),
    household: () => householdRef(),
    recipe: () => recipeRef(),
    position: p.integer(),
    section: p.string().nullable(),
    text: p.text(),
  },
  filters: householdFilter,
})
export type RecipeStep = InferEntity<typeof RecipeStep>

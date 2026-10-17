import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { householdFilter } from "../scope.ts"
import { householdRef } from "./households.ts"
import { Recipe } from "./recipes.ts"
import { Tag } from "./tags.ts"

export const RecipeTag = defineEntity({
  name: "RecipeTag",
  tableName: "recipe_tags",
  properties: {
    recipe: () => p.manyToOne(Recipe).ref().deleteRule("cascade").primary(),
    tag: () => p.manyToOne(Tag).ref().deleteRule("cascade").primary().index(),
    household: () => householdRef(),
  },
  primaryKeys: ["recipe", "tag"],
  filters: householdFilter,
})
export type RecipeTag = InferEntity<typeof RecipeTag>

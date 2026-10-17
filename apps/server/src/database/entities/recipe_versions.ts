import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { householdFilter } from "../scope.ts"
import { createdAt, id } from "./base.ts"
import { householdRef } from "./households.ts"
import { recipeRef } from "./recipes.ts"
import { User } from "./users.ts"

export const VERSION_SOURCES = [
  "import",
  "edit",
  "tidy",
  "assistant",
  "swap",
  "restore",
] as const

/** A saved copy of a recipe before each change, so any change can be undone. */
export const RecipeVersion = defineEntity({
  name: "RecipeVersion",
  tableName: "recipe_versions",
  properties: {
    id: id(),
    household: () => householdRef(),
    recipe: () => recipeRef(),
    snapshot: p.json<Record<string, unknown>>(),
    source: p.enum(VERSION_SOURCES),
    createdBy: () => p.manyToOne(User).ref().nullable().deleteRule("set null"),
    createdAt: createdAt(),
  },
  filters: householdFilter,
})
export type RecipeVersion = InferEntity<typeof RecipeVersion>

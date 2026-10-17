import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { householdFilter } from "../scope.ts"
import { createdAt, id } from "./base.ts"
import { householdRef } from "./households.ts"
import { recipeRef } from "./recipes.ts"
import { User } from "./users.ts"

/** "How did it go?" after cooking. */
export const CookNote = defineEntity({
  name: "CookNote",
  tableName: "cook_notes",
  properties: {
    id: id(),
    household: () => householdRef(),
    recipe: () => recipeRef(),
    user: () => p.manyToOne(User).ref().nullable().deleteRule("set null"),
    rating: p.smallint().nullable(),
    note: p.text().nullable(),
    createdAt: createdAt(),
  },
  filters: householdFilter,
})
export type CookNote = InferEntity<typeof CookNote>

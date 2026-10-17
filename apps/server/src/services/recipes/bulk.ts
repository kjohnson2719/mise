import type { EntityManager } from "@mikro-orm/sql"
import { Recipe } from "../../database/entities/index.ts"
import type { RecipeBulkInput } from "../../http/schemas/recipes.ts"
import { addTagsTo, removeTagsFrom } from "./tags.ts"

/**
 * Does one thing to recipes picked in select mode. Ones that aren't there
 * (or are in Recently deleted) are skipped. Tags changed this way aren't
 * edits, so no versions are kept.
 */
export async function bulkRecipes(
  em: EntityManager,
  householdId: string,
  input: RecipeBulkInput
) {
  const recipes = await em.find(Recipe, { id: { $in: input.ids } })
  switch (input.action) {
    case "delete": {
      const now = new Date()
      for (const recipe of recipes) recipe.deletedAt = now
      await em.flush()
      return { changed: recipes.length }
    }
    case "addTags":
      return {
        changed: await addTagsTo(em, householdId, recipes, input.tags),
      }
    case "removeTags":
      return { changed: await removeTagsFrom(em, recipes, input.tags) }
  }
}

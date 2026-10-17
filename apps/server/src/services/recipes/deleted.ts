import type { EntityManager } from "@mikro-orm/sql"
import { AppError } from "../../core/errors.ts"
import { Recipe } from "../../database/entities/index.ts"
import type { DeletedBulkInput } from "../../http/schemas/recipes.ts"
import {
  forHousehold,
  HOUSEHOLD_FILTER,
  NOT_DELETED_FILTER,
} from "../../database/scope.ts"
import type { JobHandler } from "../jobs/runner.ts"
import type { FileStore } from "../storage/files.ts"
import { removePhoto } from "./photos.ts"
import { summarize } from "./recipes.ts"
import { pruneTags, tagsOf } from "./tags.ts"

/** How long a recipe stays in Recently deleted. */
export const KEEP_DELETED_DAYS = 30

const DAY = 24 * 60 * 60 * 1000
const SEE_DELETED = { filters: { [NOT_DELETED_FILTER]: false } }

const goneAt = (deletedAt: Date) =>
  new Date(deletedAt.getTime() + KEEP_DELETED_DAYS * DAY)

/** Deletes recipes for good, with their lines, versions and photos. */
async function deleteRecipes(
  em: EntityManager,
  files: FileStore,
  recipes: Recipe[]
) {
  if (recipes.length === 0) return
  await em.remove(recipes).flush()
  for (const recipe of recipes) {
    await removePhoto(files, recipe.household.id, recipe.image)
  }
  await pruneTags(em)
}

/** When a recipe deleted before then is gone for good. */
const expiredBefore = () => new Date(Date.now() - KEEP_DELETED_DAYS * DAY)

/** Deletes for good what's been in one household's Recently deleted long enough. */
async function purgeExpired(em: EntityManager, files: FileStore) {
  const expired = await em.find(
    Recipe,
    { deletedAt: { $lt: expiredBefore() } },
    SEE_DELETED
  )
  await deleteRecipes(em, files, expired)
  return expired.length
}

/** The daily job that empties every household's Recently deleted of old recipes. */
export const purgeDeletedJob: JobHandler = {
  kind: "recipes.purgeDeleted",
  async run({ em, deps }) {
    const expired = await em.find(
      Recipe,
      { deletedAt: { $lt: expiredBefore() } },
      {
        filters: { [HOUSEHOLD_FILTER]: false, [NOT_DELETED_FILTER]: false },
        fields: ["household"],
      }
    )
    let purged = 0
    for (const householdId of new Set(expired.map((r) => r.household.id))) {
      purged += await purgeExpired(
        forHousehold(deps.database.em, householdId),
        deps.files
      )
    }
    return { purged }
  },
}

/** What's in Recently deleted, latest first. */
export async function listDeleted(em: EntityManager) {
  const recipes = await em.find(
    Recipe,
    { deletedAt: { $ne: null } },
    { ...SEE_DELETED, orderBy: { deletedAt: "desc", id: "asc" } }
  )
  const tags = await tagsOf(
    em,
    recipes.map((recipe) => recipe.id)
  )
  return recipes.map((recipe) => ({
    ...summarize(recipe, tags.get(recipe.id) ?? []),
    deletedAt: recipe.deletedAt!.toISOString(),
    goneAt: goneAt(recipe.deletedAt!).toISOString(),
  }))
}

async function findDeleted(em: EntityManager, recipeId: string) {
  const recipe = await em.findOne(
    Recipe,
    { id: recipeId, deletedAt: { $ne: null } },
    SEE_DELETED
  )
  if (!recipe) {
    throw new AppError(
      "not_found",
      "recipe_not_found",
      "There's no such recipe in Recently deleted."
    )
  }
  return recipe
}

/** Puts a recipe back where it was. */
export async function restoreDeleted(em: EntityManager, recipeId: string) {
  const recipe = await findDeleted(em, recipeId)
  recipe.deletedAt = null
  await em.flush()
  return recipe.slug
}

/** Deletes a recipe in Recently deleted for good, with its lines, versions and photo. */
export async function deleteForGood(
  em: EntityManager,
  files: FileStore,
  recipeId: string
) {
  await deleteRecipes(em, files, [await findDeleted(em, recipeId)])
}

/** Deletes everything in Recently deleted for good. */
export async function emptyDeleted(em: EntityManager, files: FileStore) {
  const recipes = await em.find(
    Recipe,
    { deletedAt: { $ne: null } },
    SEE_DELETED
  )
  await deleteRecipes(em, files, recipes)
}

/** Puts back, or deletes for good, recipes picked in Recently deleted. */
export async function bulkDeleted(
  em: EntityManager,
  files: FileStore,
  input: DeletedBulkInput
) {
  const recipes = await em.find(
    Recipe,
    { id: { $in: input.ids }, deletedAt: { $ne: null } },
    SEE_DELETED
  )
  if (input.action === "restore") {
    for (const recipe of recipes) recipe.deletedAt = null
    await em.flush()
  } else {
    await deleteRecipes(em, files, recipes)
  }
  return { changed: recipes.length }
}

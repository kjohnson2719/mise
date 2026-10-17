import type { EntityManager } from "@mikro-orm/sql"
import {
  RecipeVersion,
  type Recipe,
  type VERSION_SOURCES,
} from "../../database/entities/index.ts"
import { AppError } from "../../core/errors.ts"
import type { RecipeInput } from "../../http/schemas/recipes.ts"

export type VersionSource = (typeof VERSION_SOURCES)[number]

/** How many versions each recipe keeps. Older ones go. */
const KEEP = 50

/** Saves a recipe as it was before a change, so the change can be undone. */
export async function saveVersion(
  tx: EntityManager,
  options: {
    householdId: string
    recipe: Recipe
    snapshot: RecipeInput
    source: VersionSource
    userId: string | null
  }
) {
  tx.create(RecipeVersion, {
    household: options.householdId,
    recipe: options.recipe,
    snapshot: options.snapshot,
    source: options.source,
    createdBy: options.userId,
  })
  await tx.flush()
  const versions = await tx.find(
    RecipeVersion,
    { recipe: options.recipe.id },
    { orderBy: { createdAt: "desc", id: "desc" }, fields: ["id"] }
  )
  const older = versions.slice(KEEP)
  if (older.length > 0) await tx.remove(older).flush()
}

/** A recipe's versions, newest first. */
export async function listVersions(em: EntityManager, recipeId: string) {
  const versions = await em.find(
    RecipeVersion,
    { recipe: recipeId },
    { orderBy: { createdAt: "desc", id: "desc" }, populate: ["createdBy"] }
  )
  return versions.map((version) => ({
    id: version.id,
    source: version.source,
    name: String((version.snapshot as Partial<RecipeInput>).name ?? ""),
    createdBy: version.createdBy?.getEntity().name ?? null,
    createdAt: version.createdAt.toISOString(),
  }))
}

/** One of a recipe's versions: what it held. */
export async function versionSnapshot(
  em: EntityManager,
  recipeId: string,
  versionId: string
): Promise<RecipeInput> {
  const version = await em.findOne(RecipeVersion, {
    id: versionId,
    recipe: recipeId,
  })
  if (!version) {
    throw new AppError(
      "not_found",
      "version_not_found",
      "That recipe has no such version."
    )
  }
  return version.snapshot as RecipeInput
}

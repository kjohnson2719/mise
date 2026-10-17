import type { EntityManager } from "@mikro-orm/sql"
import {
  RecipePairing,
  RecipeTag,
  Tag,
  type Recipe,
} from "../../database/entities/index.ts"
import { HOUSEHOLD_FILTER } from "../../database/scope.ts"
import { AppError } from "../../core/errors.ts"

/** "Dinner" and "dinner " are the same tag. */
export const tagKey = (name: string) => name.trim().toLowerCase()

const byName = (a: string, b: string) =>
  a.localeCompare(b, undefined, { sensitivity: "base" })

/** Each recipe's tag names, alphabetically. */
export async function tagsOf(
  em: EntityManager,
  recipeIds: readonly string[]
): Promise<Map<string, string[]>> {
  const tags = new Map<string, string[]>(recipeIds.map((id) => [id, []]))
  if (recipeIds.length === 0) return tags
  const rows = await em.find(
    RecipeTag,
    { recipe: { $in: [...recipeIds] } },
    { populate: ["tag"] }
  )
  for (const row of rows) {
    tags.get(row.recipe.id)?.push(row.tag.getEntity().name)
  }
  for (const names of tags.values()) names.sort(byName)
  return tags
}

/** Gives a recipe exactly these tags, making any that don't exist yet. */
export async function setTags(
  tx: EntityManager,
  householdId: string,
  recipe: Recipe,
  names: readonly string[]
) {
  const wanted = new Map<string, string>()
  for (const name of names) {
    const key = tagKey(name)
    if (key && !wanted.has(key)) wanted.set(key, name.trim())
  }

  const existing = await tx.find(Tag, { nameKey: { $in: [...wanted.keys()] } })
  const tags = new Map(existing.map((tag) => [tag.nameKey, tag]))
  for (const [key, name] of wanted) {
    if (!tags.has(key)) {
      tags.set(
        key,
        tx.create(Tag, { household: householdId, name, nameKey: key })
      )
    }
  }

  const current = await tx.find(
    RecipeTag,
    { recipe: recipe.id },
    {
      populate: ["tag"],
    }
  )
  for (const row of current) {
    if (!wanted.has(row.tag.getEntity().nameKey)) tx.remove(row)
  }
  const have = new Set(current.map((row) => row.tag.getEntity().nameKey))
  for (const [key, tag] of tags) {
    if (!have.has(key)) {
      tx.create(RecipeTag, { recipe, tag, household: householdId })
    }
  }
}

/**
 * Adds these tags to recipes, keeping the ones they have, making any tags
 * that don't exist yet. Says how many recipes gained one.
 */
export async function addTagsTo(
  tx: EntityManager,
  householdId: string,
  recipes: readonly Recipe[],
  names: readonly string[]
) {
  const wanted = new Map<string, string>()
  for (const name of names) {
    const key = tagKey(name)
    if (key && !wanted.has(key)) wanted.set(key, name.trim())
  }
  const tags = new Map(
    (await tx.find(Tag, { nameKey: { $in: [...wanted.keys()] } })).map(
      (tag) => [tag.nameKey, tag]
    )
  )
  for (const [key, name] of wanted) {
    if (!tags.has(key)) {
      tags.set(
        key,
        tx.create(Tag, { household: householdId, name, nameKey: key })
      )
    }
  }
  const have = new Set(
    (
      await tx.find(
        RecipeTag,
        { recipe: { $in: recipes.map((recipe) => recipe.id) } },
        { populate: ["tag"] }
      )
    ).map((row) => `${row.recipe.id} ${row.tag.getEntity().nameKey}`)
  )
  let changed = 0
  for (const recipe of recipes) {
    let gained = false
    for (const [key, tag] of tags) {
      if (have.has(`${recipe.id} ${key}`)) continue
      tx.create(RecipeTag, { recipe, tag, household: householdId })
      gained = true
    }
    if (gained) changed++
  }
  await tx.flush()
  return changed
}

/** Takes these tags off recipes. Says how many recipes lost one. */
export async function removeTagsFrom(
  tx: EntityManager,
  recipes: readonly Recipe[],
  names: readonly string[]
) {
  const keys = [...new Set(names.map(tagKey).filter(Boolean))]
  const tags = await tx.find(Tag, { nameKey: { $in: keys } })
  if (tags.length === 0) return 0
  const rows = await tx.find(RecipeTag, {
    recipe: { $in: recipes.map((recipe) => recipe.id) },
    tag: { $in: tags.map((tag) => tag.id) },
  })
  const changed = new Set(rows.map((row) => row.recipe.id)).size
  tx.remove(rows)
  await tx.flush()
  await pruneTags(tx)
  return changed
}

/** Deletes tags no recipe has, Recently deleted ones included. */
export async function pruneTags(tx: EntityManager) {
  const used = new Set(
    (await tx.find(RecipeTag, {}, { fields: ["tag"] })).map((row) => row.tag.id)
  )
  for (const tag of await tx.find(Tag, {})) {
    if (!used.has(tag.id)) tx.remove(tag)
  }
  await tx.flush()
}

/** The household's tags, with how many recipes have each, alphabetically. */
export async function listTags(em: EntityManager) {
  const tags = await em.find(Tag, {})
  const counts = new Map<string, number>()
  for (const row of await em.find(
    RecipeTag,
    { recipe: { deletedAt: null } },
    { fields: ["tag"] }
  )) {
    counts.set(row.tag.id, (counts.get(row.tag.id) ?? 0) + 1)
  }
  return tags
    .map((tag) => ({
      id: tag.id,
      name: tag.name,
      recipes: counts.get(tag.id) ?? 0,
    }))
    .filter((tag) => tag.recipes > 0)
    .sort((a, b) => byName(a.name, b.name))
}

/**
 * Pairings with a whole tag ("any Sauce") follow it when it's renamed or
 * merged into another.
 */
async function movePairings(tx: EntityManager, from: string, to: string) {
  if (from === to) return
  const there = new Set(
    (await tx.find(RecipePairing, { tagKey: to }, { fields: ["recipe"] })).map(
      (pairing) => pairing.recipe.id
    )
  )
  for (const pairing of await tx.find(RecipePairing, { tagKey: from })) {
    if (there.has(pairing.recipe.id)) tx.remove(pairing)
    else pairing.tagKey = to
  }
}

async function findTag(em: EntityManager, tagId: string) {
  const tag = await em.findOne(Tag, { id: tagId })
  if (!tag)
    throw new AppError("not_found", "tag_not_found", "There's no such tag.")
  return tag
}

/**
 * Renames a tag. If another tag already has that name, the two become one:
 * its recipes move to the other, and this one goes.
 */
export async function renameTag(
  em: EntityManager,
  householdId: string,
  tagId: string,
  name: string
) {
  await em.transactional(async (tx) => {
    tx.setFilterParams(HOUSEHOLD_FILTER, { householdId })
    const tag = await findTag(tx, tagId)
    const other = await tx.findOne(Tag, {
      nameKey: tagKey(name),
      id: { $ne: tag.id },
    })
    await movePairings(tx, tag.nameKey, tagKey(name))
    if (!other) {
      tag.name = name.trim()
      tag.nameKey = tagKey(name)
      await tx.flush()
      return
    }
    const already = new Set(
      (await tx.find(RecipeTag, { tag: other.id }, { fields: ["recipe"] })).map(
        (row) => row.recipe.id
      )
    )
    for (const row of await tx.find(RecipeTag, { tag: tag.id })) {
      if (!already.has(row.recipe.id)) {
        tx.create(RecipeTag, {
          recipe: row.recipe,
          tag: other,
          household: householdId,
        })
      }
      tx.remove(row)
    }
    tx.remove(tag)
    await tx.flush()
  })
}

/** Takes a tag off every recipe, and out of what recipes go with, and deletes it. */
export async function deleteTag(em: EntityManager, tagId: string) {
  const tag = await findTag(em, tagId)
  await em.nativeDelete(RecipeTag, { tag: tag.id })
  await em.nativeDelete(RecipePairing, { tagKey: tag.nameKey })
  await em.remove(tag).flush()
}

import type { EntityManager } from "@mikro-orm/sql"
import { AppError } from "../../core/errors.ts"
import {
  Recipe,
  RecipePairing,
  RecipeTag,
  Tag,
} from "../../database/entities/index.ts"
import type { PairingsInput } from "../../http/schemas/recipes.ts"
import { photoUrls } from "./photos.ts"
import { findRecipe, toNumber, totalMinutes } from "./recipes.ts"
import { tagKey } from "./tags.ts"

// "Goes with": a recipe pairs with particular recipes, or with every recipe
// that has a tag ("any Sauce"), so new ones join by themselves.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" })

/** A recipe offered alongside another. */
function option(recipe: Recipe) {
  return {
    id: recipe.id,
    slug: recipe.slug,
    name: recipe.name,
    photo: photoUrls(recipe)?.card ?? null,
    servings: toNumber(recipe.servings),
    totalMinutes: totalMinutes(recipe),
  }
}

type Pairing =
  | { id: string; kind: "recipe"; recipe: ReturnType<typeof option> }
  | { id: string; kind: "tag"; tag: string }

/** Recipes by id, leaving out any in Recently deleted. */
async function recipesById(em: EntityManager, ids: readonly string[]) {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return new Map<string, Recipe>()
  const found = await em.find(Recipe, { id: { $in: unique } })
  return new Map(found.map((recipe) => [recipe.id, recipe]))
}

/**
 * What a recipe goes with: its pairings as set, every recipe they add up to
 * (picked ones first, then tagged ones by name), and the recipes it's
 * offered with.
 */
export async function getPairings(em: EntityManager, idOrSlug: string) {
  const base = await findRecipe(em, idOrSlug)
  const rules = await em.find(
    RecipePairing,
    { recipe: base.id },
    { orderBy: { createdAt: "asc", id: "asc" } }
  )

  // A recipe in Recently deleted drops out, and comes back if it's restored.
  const picked = await recipesById(
    em,
    rules.flatMap((rule) => (rule.pairedRecipe ? [rule.pairedRecipe.id] : []))
  )
  const keys = rules.flatMap((rule) => (rule.tagKey ? [rule.tagKey] : []))
  const tags =
    keys.length > 0 ? await em.find(Tag, { nameKey: { $in: keys } }) : []
  const tagNames = new Map(tags.map((tag) => [tag.nameKey, tag.name]))
  const tagged =
    tags.length > 0
      ? await recipesById(
          em,
          (
            await em.find(
              RecipeTag,
              { tag: { $in: tags.map((tag) => tag.id) } },
              { fields: ["recipe"] }
            )
          ).map((row) => row.recipe.id)
        )
      : new Map<string, Recipe>()

  const pairings = rules.flatMap((rule): Pairing[] => {
    if (rule.pairedRecipe) {
      const recipe = picked.get(rule.pairedRecipe.id)
      return recipe
        ? [{ id: rule.id, kind: "recipe", recipe: option(recipe) }]
        : []
    }
    // A tag no recipe has right now keeps its pairing, by its name's key.
    return rule.tagKey
      ? [
          {
            id: rule.id,
            kind: "tag",
            tag: tagNames.get(rule.tagKey) ?? rule.tagKey,
          },
        ]
      : []
  })

  const seen = new Set([base.id])
  const options = [
    ...rules.flatMap((rule) => {
      const recipe = rule.pairedRecipe && picked.get(rule.pairedRecipe.id)
      return recipe ? [recipe] : []
    }),
    ...[...tagged.values()].sort(byName),
  ].flatMap((recipe) => {
    if (seen.has(recipe.id)) return []
    seen.add(recipe.id)
    return [option(recipe)]
  })

  // The other way round: recipes that pair with this one, or one of its tags.
  const ownKeys = (
    await em.find(RecipeTag, { recipe: base.id }, { populate: ["tag"] })
  ).map((row) => row.tag.getEntity().nameKey)
  const offeredWith = await em.find(
    RecipePairing,
    {
      recipe: { $ne: base.id },
      $or: [
        { pairedRecipe: base.id },
        ...(ownKeys.length > 0 ? [{ tagKey: { $in: ownKeys } }] : []),
      ],
    },
    { fields: ["recipe"] }
  )
  const pairsWith = [
    ...(
      await recipesById(
        em,
        offeredWith.map((pairing) => pairing.recipe.id)
      )
    ).values(),
  ]
    .sort(byName)
    .map(option)

  return { pairings, options, pairsWith }
}

/** Adds recipes, or a whole tag, to what a recipe goes with. */
export async function addPairings(
  em: EntityManager,
  options: { householdId: string; recipe: string; input: PairingsInput }
) {
  const base = await findRecipe(em, options.recipe)
  const existing = await em.find(RecipePairing, { recipe: base.id })
  const pairedIds = new Set(
    existing.flatMap((rule) =>
      rule.pairedRecipe ? [rule.pairedRecipe.id] : []
    )
  )
  for (const idOrSlug of options.input.recipes ?? []) {
    const paired = await em.findOne(
      Recipe,
      UUID.test(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug }
    )
    if (!paired) {
      throw new AppError(
        "not_found",
        "recipe_not_found",
        "One of those recipes isn't there."
      )
    }
    if (paired.id === base.id || pairedIds.has(paired.id)) continue
    pairedIds.add(paired.id)
    em.create(RecipePairing, {
      household: options.householdId,
      recipe: base,
      pairedRecipe: paired,
    })
  }
  if (options.input.tag) {
    const tag = await em.findOne(Tag, { nameKey: tagKey(options.input.tag) })
    if (!tag) {
      throw new AppError(
        "invalid",
        "tag_not_found",
        "There's no tag by that name.",
        { tag: "There's no tag by that name." }
      )
    }
    if (!existing.some((rule) => rule.tagKey === tag.nameKey)) {
      em.create(RecipePairing, {
        household: options.householdId,
        recipe: base,
        tagKey: tag.nameKey,
      })
    }
  }
  await em.flush()
  return getPairings(em, base.id)
}

export async function removePairing(
  em: EntityManager,
  options: { recipe: string; pairingId: string }
) {
  const base = await findRecipe(em, options.recipe)
  const pairing = UUID.test(options.pairingId)
    ? await em.findOne(RecipePairing, {
        id: options.pairingId,
        recipe: base.id,
      })
    : null
  if (!pairing) {
    throw new AppError(
      "not_found",
      "pairing_not_found",
      "That pairing isn't there."
    )
  }
  await em.remove(pairing).flush()
  return getPairings(em, base.id)
}

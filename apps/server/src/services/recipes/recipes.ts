import {
  applyDietOverrides,
  dietsFor,
  foodKey,
  joinSections,
  keptOverrides,
  namesFood,
  parseIngredient,
  splitSections,
  type Diet,
  type DietOverrides,
  type IngredientMark,
  type FoodLine,
  type FoodSource,
  type MarkedLine,
} from "@merran/shared"
import { raw, type FilterQuery } from "@mikro-orm/core"
import type { EntityManager } from "@mikro-orm/sql"
import { rescaled } from "../nutrition/nutrition.ts"
import { photoAfterCreate } from "../ai-photos/runs.ts"
import { nutritionAfterSave } from "../nutrition/runs.ts"
import {
  CookNote,
  Recipe,
  RecipeIngredient,
  RecipeStep,
  RecipeTag,
  RecipeVersion,
  Tag,
  type Nutrition,
  type RECIPE_ORIGINS,
} from "../../database/entities/index.ts"
import { HOUSEHOLD_FILTER } from "../../database/scope.ts"
import type { FileStore } from "../storage/files.ts"
import { containing } from "../../database/text.ts"
import { AppError } from "../../core/errors.ts"
import type { RecipeInput } from "../../http/schemas/recipes.ts"
import {
  decodeDiets,
  encodeDiets,
  overridesOf,
  withDiet,
  workOutDiets,
} from "./diet-labels.ts"
import { photoUrls, removePhoto, storePhoto } from "./photos.ts"
import { uniqueSlug } from "./slugs.ts"
import { pruneTags, setTags, tagKey, tagsOf } from "./tags.ts"
import { saveVersion, type VersionSource } from "./versions.ts"

export type RecipeOrigin = (typeof RECIPE_ORIGINS)[number]

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Runs `work` in a transaction that sees only one household's rows. It
 * starts from a fresh fork, so what it loads isn't shared with whatever
 * the caller already loaded.
 */
export function inHouseholdTransaction<T>(
  em: EntityManager,
  householdId: string,
  work: (tx: EntityManager) => Promise<T>
): Promise<T> {
  return em.fork().transactional((tx) => {
    tx.setFilterParams(HOUSEHOLD_FILTER, { householdId })
    return work(tx)
  })
}

/** A recipe by its id or slug, with its lines. Not one in Recently deleted. */
export async function findRecipe(em: EntityManager, idOrSlug: string) {
  const recipe = await em.findOne(
    Recipe,
    UUID.test(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug },
    { populate: ["ingredients", "steps"] }
  )
  if (!recipe) {
    throw new AppError(
      "not_found",
      "recipe_not_found",
      "There's no such recipe."
    )
  }
  return recipe
}

/** A double column, which the database driver may hand back as text. */
export const toNumber = (value: string | number | null | undefined) =>
  value == null ? null : Number(value)

/** Total time as given, or prep and cook added up. */
export function totalMinutes(recipe: Recipe) {
  if (recipe.totalMinutes != null) return recipe.totalMinutes
  if (recipe.prepMinutes == null && recipe.cookMinutes == null) return null
  return (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0)
}

export function summarize(recipe: Recipe, tags: string[]) {
  return {
    id: recipe.id,
    slug: recipe.slug,
    name: recipe.name,
    description: recipe.description ?? null,
    servings: toNumber(recipe.servings),
    totalMinutes: totalMinutes(recipe),
    rating: recipe.rating ?? null,
    tags,
    diets: decodeDiets(recipe.diets),
    photo: photoUrls(recipe),
    lastMadeAt: recipe.lastMadeAt?.toISOString() ?? null,
    createdAt: recipe.createdAt.toISOString(),
    updatedAt: recipe.updatedAt.toISOString(),
  }
}

/** A recipe with everything in it, its lines loaded. */
export function describeRecipe(recipe: Recipe, tags: string[]) {
  return {
    ...summarize(recipe, tags),
    origin: recipe.origin,
    photoByAi: recipe.imageByAi,
    sourceUrl: recipe.sourceUrl ?? null,
    yieldText: recipe.yieldText ?? null,
    prepMinutes: recipe.prepMinutes ?? null,
    cookMinutes: recipe.cookMinutes ?? null,
    notes: recipe.notes ?? null,
    dietOverrides: overridesOf(recipe),
    nutrition: recipe.nutrition ?? null,
    needs: recipe.needs ?? [],
    ingredients: recipe.ingredients.getItems().map((line) => ({
      id: line.id,
      section: line.section ?? null,
      text: line.rawText,
      quantity: toNumber(line.quantity),
      quantityMax: toNumber(line.quantityMax),
      unit: line.unit ?? null,
      food: line.food ?? null,
      note: line.note ?? null,
      mark: line.mark ?? null,
    })),
    steps: recipe.steps.getItems().map((step) => ({
      id: step.id,
      section: step.section ?? null,
      text: step.text,
    })),
  }
}

export async function loadRecipe(em: EntityManager, idOrSlug: string) {
  const recipe = await findRecipe(em, idOrSlug)
  const tags = await tagsOf(em, [recipe.id])
  return describeRecipe(recipe, tags.get(recipe.id) ?? [])
}

/** A recipe as editor lines, for a version or to edit. */
export function snapshotOf(recipe: Recipe, tags: string[]): RecipeInput {
  return {
    name: recipe.name,
    description: recipe.description ?? null,
    servings: toNumber(recipe.servings),
    yieldText: recipe.yieldText ?? null,
    prepMinutes: recipe.prepMinutes ?? null,
    cookMinutes: recipe.cookMinutes ?? null,
    totalMinutes: recipe.totalMinutes ?? null,
    notes: recipe.notes ?? null,
    sourceUrl: recipe.sourceUrl ?? null,
    rating: recipe.rating ?? null,
    tags,
    ingredients: joinSections(
      recipe.ingredients
        .getItems()
        .map((line) => ({ section: line.section ?? null, text: line.rawText }))
    ),
    steps: joinSections(
      recipe.steps
        .getItems()
        .map((step) => ({ section: step.section ?? null, text: step.text }))
    ),
  }
}

/**
 * What each line is to the dish, from lines that were marked: a line keeps
 * its mark by its words, or else by its food, so an edit that rewords
 * "2 lemons" to "2 lemons, juiced" keeps it.
 */
export function marksFrom(lines: readonly MarkedLine[]) {
  const byText = new Map<string, IngredientMark>()
  const byFood = new Map<string, IngredientMark>()
  for (const { line, mark } of lines) {
    if (!mark) continue
    byText.set(line.trim().toLowerCase(), mark)
    const food = parseIngredient(line).food
    if (food) byFood.set(foodKey(food), mark)
  }
  return (line: string, food: string | null): IngredientMark | null =>
    byText.get(line.trim().toLowerCase()) ??
    (food ? byFood.get(foodKey(food)) : undefined) ??
    null
}

/** A recipe's ingredient lines and their marks. */
export const markedLines = (recipe: Recipe): MarkedLine[] =>
  recipe.ingredients
    .getItems()
    .map((line) => ({ line: line.rawText, mark: line.mark ?? null }))

/** A food someone said a line is, and who: a person or AI. */
type ChosenFood = { food: string; source: FoodSource }

/** A recipe's ingredient lines and the food each was said to be. */
export const chosenFoods = (recipe: Recipe): FoodLine[] =>
  recipe.ingredients
    .getItems()
    .map((line) => ({ line: line.rawText, food: line.foodKey ?? null }))

/**
 * The food each line was said to be, kept as marks are (by its words, or
 * else by its food), with who said it. `suggested`, from tidy up, wins
 * over what lines had, and is AI's unless it's what they had.
 */
function chosenFrom(recipe: Recipe, suggested?: readonly FoodLine[]) {
  const had = recipe.ingredients.isInitialized()
    ? recipe.ingredients.getItems()
    : []
  const lookup = <T>(entries: { line: string; value: T }[]) => {
    const byText = new Map<string, T>()
    const byFood = new Map<string, T>()
    for (const { line, value } of entries) {
      byText.set(line.trim().toLowerCase(), value)
      const food = parseIngredient(line).food
      if (food) byFood.set(foodKey(food), value)
    }
    return (line: string, food: string | null) =>
      byText.get(line.trim().toLowerCase()) ??
      (food ? byFood.get(foodKey(food)) : undefined)
  }
  const kept = lookup<ChosenFood>(
    had.flatMap((line) =>
      line.foodKey && line.foodSource
        ? [
            {
              line: line.rawText,
              value: { food: line.foodKey, source: line.foodSource },
            },
          ]
        : []
    )
  )
  const proposed = suggested
    ? lookup<string | null>(
        suggested.map(({ line, food }) => ({ line, value: food }))
      )
    : null
  return (line: string, food: string | null): ChosenFood | null => {
    const before = kept(line, food) ?? null
    if (!proposed) return before
    const now = proposed(line, food)
    if (now === undefined || now === null) return now === null ? null : before
    return now === before?.food ? before : { food: now, source: "ai" }
  }
}

/**
 * Sets a recipe to what the input says, lines and tags included. Its lines
 * keep their marks (see `marksFrom`), unless `marks` says otherwise.
 */
async function fill(
  tx: EntityManager,
  householdId: string,
  recipe: Recipe,
  input: RecipeInput,
  marks?: readonly MarkedLine[],
  foods?: readonly FoodLine[]
) {
  const markOf = marksFrom(
    marks ?? (recipe.ingredients.isInitialized() ? markedLines(recipe) : [])
  )
  const chosenOf = chosenFrom(recipe, foods)
  const linesBefore = recipe.ingredients.isInitialized()
    ? recipe.ingredients.getItems().map((line) => line.rawText)
    : []
  const servingsBefore = toNumber(recipe.servings)
  recipe.name = input.name
  recipe.description = input.description
  recipe.servings = input.servings
  recipe.yieldText = input.yieldText
  recipe.prepMinutes = input.prepMinutes
  recipe.cookMinutes = input.cookMinutes
  recipe.totalMinutes = input.totalMinutes
  recipe.notes = input.notes
  recipe.sourceUrl = input.sourceUrl
  recipe.rating = input.rating

  recipe.ingredients.set(
    splitSections(input.ingredients).map((item, position) => {
      const parsed = parseIngredient(item.text)
      const chosen = chosenOf(parsed.text, parsed.food)
      return tx.create(RecipeIngredient, {
        household: householdId,
        recipe,
        position,
        section: item.section,
        rawText: parsed.text,
        quantity: parsed.quantity,
        quantityMax: parsed.quantityMax,
        unit: parsed.unitId,
        food: parsed.food,
        note: parsed.note,
        mark: markOf(parsed.text, parsed.food),
        foodKey: chosen?.food ?? null,
        foodSource: chosen?.source ?? null,
      })
    })
  )
  const lines = recipe.ingredients.getItems().map((line) => line.rawText)
  workOutDiets(recipe, lines)
  const ingredientsChanged =
    JSON.stringify(lines) !== JSON.stringify(linesBefore)
  // The same food shared among more or fewer: each serving has more or less.
  const nutrition = recipe.nutrition
  const servings = toNumber(recipe.servings)
  const workedOutFor = nutrition?.servings ?? servingsBefore
  if (
    nutrition &&
    !ingredientsChanged &&
    workedOutFor &&
    servings &&
    workedOutFor !== servings
  ) {
    recipe.nutrition = rescaled(nutrition, workedOutFor, servings)
  }
  recipe.steps.set(
    splitSections(input.steps).map((item, position) =>
      tx.create(RecipeStep, {
        household: householdId,
        recipe,
        position,
        section: item.section,
        text: item.text,
      })
    )
  )
  await setTags(tx, householdId, recipe, input.tags)
  await tx.flush()
  return { ingredientsChanged }
}

export async function createRecipe(
  em: EntityManager,
  options: {
    householdId: string
    userId: string | null
    input: RecipeInput
    origin?: RecipeOrigin
    /** A photo already stored for it (see photos.ts). */
    photoId?: string | null
    /** Its nutrition from the recipe's site. */
    nutrition?: Nutrition | null
  }
) {
  const id = await inHouseholdTransaction(
    em,
    options.householdId,
    async (tx) => {
      const recipe = tx.create(Recipe, {
        household: options.householdId,
        slug: await uniqueSlug(tx, options.input.name),
        name: options.input.name,
        origin: options.origin ?? "manual",
        image: options.photoId ?? null,
        createdBy: options.userId,
        nutrition: options.nutrition ?? null,
      })
      await fill(tx, options.householdId, recipe, options.input)
      return recipe.id
    }
  )
  if (!options.nutrition && options.input.servings) {
    await nutritionAfterSave(em, {
      householdId: options.householdId,
      userId: options.userId,
      recipeId: id,
    })
  }
  if (!options.photoId) {
    await photoAfterCreate(em, {
      householdId: options.householdId,
      userId: options.userId,
      recipeId: id,
      origin: options.origin ?? "manual",
    })
  }
  return loadRecipe(em.fork(), id)
}

/**
 * A recipe brought in whole from a Merran export, as it was: its own id
 * when no other recipe has it, its address when that's free, when it was
 * made, changed and rated, its diet corrections, versions and cooking notes.
 */
export async function importRecipe(
  em: EntityManager,
  options: {
    householdId: string
    /** Its id from the export, or null for a new one. */
    id: string | null
    slug: string
    input: RecipeInput
    origin: RecipeOrigin
    /** Where another app's import brought it from (see the entity). */
    importedFrom?: string | null
    photoId: string | null
    createdBy: string | null
    lastMadeAt: Date | null
    nutrition: Nutrition | null
    dietOverrides: Record<string, boolean>
    needs?: readonly string[]
    /** What each ingredient line is to the dish. */
    marks?: readonly MarkedLine[]
    createdAt: Date
    updatedAt: Date
    versions: {
      source: VersionSource
      snapshot: Record<string, unknown>
      createdAt: Date
      createdBy: string | null
    }[]
    cookNotes: {
      rating: number | null
      note: string | null
      createdAt: Date
      user: string | null
    }[]
  }
) {
  return inHouseholdTransaction(em, options.householdId, async (tx) => {
    const recipe = tx.create(Recipe, {
      ...(options.id ? { id: options.id } : {}),
      household: options.householdId,
      slug: await uniqueSlug(tx, options.slug),
      name: options.input.name,
      origin: options.origin,
      importedFrom: options.importedFrom ?? null,
      image: options.photoId,
      createdBy: options.createdBy,
      // Made before it came here, so off this plan.
      lastMadeAt: options.lastMadeAt,
      madeOffPlanAt: options.lastMadeAt,
      nutrition: options.nutrition,
      dietOverrides:
        Object.keys(options.dietOverrides).length > 0
          ? options.dietOverrides
          : null,
      needs: options.needs?.length ? [...options.needs] : null,
      createdAt: options.createdAt,
      updatedAt: options.updatedAt,
    })
    await fill(tx, options.householdId, recipe, options.input, options.marks)
    for (const version of options.versions) {
      tx.create(RecipeVersion, {
        household: options.householdId,
        recipe,
        snapshot: version.snapshot,
        source: version.source,
        createdBy: version.createdBy,
        createdAt: version.createdAt,
      })
    }
    for (const note of options.cookNotes) {
      tx.create(CookNote, {
        household: options.householdId,
        recipe,
        user: note.user,
        rating: note.rating,
        note: note.note,
        createdAt: note.createdAt,
      })
    }
    await tx.flush()
    return recipe.id
  })
}

/**
 * Replaces a recipe with the input, keeping a version of how it was. Its
 * slug stays, so links to it keep working.
 */
export async function updateRecipe(
  em: EntityManager,
  options: {
    householdId: string
    userId: string | null
    recipe: string
    input: RecipeInput
    source?: VersionSource
    /** What each line is to the dish, when the change marks them. */
    marks?: readonly MarkedLine[]
    /** The food lines Merran doesn't know are, when tidy up said. */
    foods?: readonly FoodLine[]
    /** Tidy up looked at it. */
    tidied?: boolean
  }
) {
  const id = await inHouseholdTransaction(
    em,
    options.householdId,
    async (tx) => {
      const recipe = await findRecipe(tx, options.recipe)
      const tags = (await tagsOf(tx, [recipe.id])).get(recipe.id) ?? []
      await saveVersion(tx, {
        householdId: options.householdId,
        recipe,
        snapshot: snapshotOf(recipe, tags),
        source: options.source ?? "edit",
        userId: options.userId,
      })
      const { ingredientsChanged } = await fill(
        tx,
        options.householdId,
        recipe,
        options.input,
        options.marks,
        options.foods
      )
      if (options.tidied) recipe.tidiedAt = new Date()
      await pruneTags(tx)
      const missing = !recipe.nutrition && Boolean(options.input.servings)
      return { id: recipe.id, workOut: ingredientsChanged || missing }
    }
  )
  if (id.workOut) {
    await nutritionAfterSave(em, {
      householdId: options.householdId,
      userId: options.userId,
      recipeId: id.id,
    })
  }
  return loadRecipe(em.fork(), id.id)
}

export type RecipeListOptions = {
  q?: string | undefined
  tag: string[]
  /** Only recipes not made yet, or only ones made. */
  new?: boolean | undefined
  /** Only recipes with all these diet labels. */
  diet: Diet[]
  /** Only recipes ready in this many minutes or fewer. */
  maxMinutes?: number | undefined
  /** Only these recipes, as for those with something on sale. */
  only?: readonly string[] | undefined
  sort: keyof typeof ORDER
  limit: number
  offset: number
}

// Ties go newest first, by id (ids are made in time order).
const ORDER = {
  newest: { createdAt: "desc", id: "desc" },
  name: { name: "asc", id: "desc" },
  updated: { updatedAt: "desc", id: "desc" },
  rating: { rating: "desc nulls last", name: "asc", id: "desc" },
  made: { lastMadeAt: "desc nulls last", name: "asc", id: "desc" },
} as const

/** Recipes matching a search and tags, a page at a time. */
export async function listRecipes(
  em: EntityManager,
  {
    q,
    tag,
    new: fresh,
    diet,
    maxMinutes,
    only,
    sort,
    limit,
    offset,
  }: RecipeListOptions
) {
  const where: FilterQuery<Recipe> = {}
  const and: FilterQuery<Recipe>[] = []
  if (only) and.push({ id: { $in: [...only] } })
  if (fresh !== undefined) {
    and.push({ lastMadeAt: fresh ? null : { $ne: null } })
  }
  for (const label of new Set(diet)) and.push({ diets: withDiet(label) })
  if (maxMinutes !== undefined) {
    // Its total as given, or prep and cook added up, as it's shown.
    and.push({
      [raw(
        (alias) =>
          `coalesce(${alias}.total_minutes, ${alias}.prep_minutes + ${alias}.cook_minutes, ${alias}.prep_minutes, ${alias}.cook_minutes)`
      )]: { $lte: maxMinutes },
    })
  }

  const words = q?.trim()
  if (words) {
    const like = containing(em, words)
    const inIngredients = await em.find(
      RecipeIngredient,
      { rawText: like },
      { fields: ["recipe"] }
    )
    and.push({
      $or: [
        { name: like },
        { description: like },
        {
          id: {
            $in: [...new Set(inIngredients.map((line) => line.recipe.id))],
          },
        },
      ],
    })
  }

  const keys = [...new Set(tag.map(tagKey).filter(Boolean))]
  if (keys.length > 0) {
    const tags = await em.find(Tag, { nameKey: { $in: keys } })
    if (tags.length < keys.length) return { recipes: [], total: 0 }
    const rows = await em.find(
      RecipeTag,
      { tag: { $in: tags.map((t) => t.id) } },
      { fields: ["recipe", "tag"] }
    )
    const counts = new Map<string, number>()
    for (const row of rows) {
      counts.set(row.recipe.id, (counts.get(row.recipe.id) ?? 0) + 1)
    }
    and.push({
      id: {
        $in: [...counts].flatMap(([id, n]) => (n === keys.length ? [id] : [])),
      },
    })
  }
  if (and.length > 0) where.$and = and

  const [recipes, total] = await em.findAndCount(Recipe, where, {
    orderBy: ORDER[sort],
    limit,
    offset,
  })
  const tags = await tagsOf(
    em,
    recipes.map((recipe) => recipe.id)
  )
  return {
    recipes: recipes.map((recipe) =>
      summarize(recipe, tags.get(recipe.id) ?? [])
    ),
    total,
  }
}

/** Moves a recipe to Recently deleted. */
export async function moveToDeleted(em: EntityManager, idOrSlug: string) {
  const recipe = await em.findOne(
    Recipe,
    UUID.test(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug }
  )
  if (!recipe) {
    throw new AppError(
      "not_found",
      "recipe_not_found",
      "There's no such recipe."
    )
  }
  recipe.deletedAt = new Date()
  await em.flush()
}

/** Gives a recipe a new photo, in place of any it had. */
export async function setPhoto(
  em: EntityManager,
  files: FileStore,
  options: { householdId: string; recipe: string; photo: Buffer }
) {
  const recipe = await findRecipe(em, options.recipe)
  const photoId = await storePhoto(files, options.householdId, options.photo)
  const old = recipe.image
  recipe.image = photoId
  recipe.imageByAi = false
  await em.flush()
  await removePhoto(files, options.householdId, old)
  return loadRecipe(em, recipe.id)
}

/** Takes a recipe's photo away, and deletes it. */
export async function clearPhoto(
  em: EntityManager,
  files: FileStore,
  options: { householdId: string; recipe: string }
) {
  const recipe = await findRecipe(em, options.recipe)
  const old = recipe.image
  recipe.image = null
  recipe.imageByAi = false
  await em.flush()
  await removePhoto(files, options.householdId, old)
  return loadRecipe(em, recipe.id)
}

/**
 * "I made this", with no meal of it on the plan to mark cooked: the recipe
 * was made now, off the plan. Not an edit, so no version is kept.
 */
export async function markMade(em: EntityManager, options: { recipe: string }) {
  const recipe = await findRecipe(em, options.recipe)
  const now = new Date()
  recipe.lastMadeAt = now
  recipe.madeOffPlanAt = now
  await em.flush()
  return loadRecipe(em, recipe.id)
}

/**
 * Corrects a recipe's diet labels. Only corrections that differ from what
 * the ingredients suggest are kept; they stick when the recipe is edited.
 * Not an edit, so no version is kept.
 */
export async function setDiets(
  em: EntityManager,
  options: { recipe: string; overrides: DietOverrides }
) {
  const recipe = await findRecipe(em, options.recipe)
  const suggested = dietsFor(
    recipe.ingredients.getItems().map((line) => line.rawText)
  )
  const kept = keptOverrides(suggested, options.overrides)
  recipe.dietOverrides = Object.keys(kept).length > 0 ? kept : null
  recipe.diets = encodeDiets(applyDietOverrides(suggested, kept))
  await em.flush()
  return loadRecipe(em, recipe.id)
}

/**
 * Says which foods a recipe can't do without, so a dislike in it rules it
 * out rather than being left out. Not an edit, so no version is kept.
 */
export async function setNeeds(
  em: EntityManager,
  options: {
    recipe: string
    foods: readonly string[]
    /** Foods tidy up marked needed that it can do without after all. */
    canLeaveOut?: readonly string[]
  }
) {
  const recipe = await findRecipe(em, options.recipe)
  const foods = [
    ...new Set(
      options.foods.map((food) => food.trim().toLowerCase()).filter(Boolean)
    ),
  ]
  recipe.needs = foods.length > 0 ? foods : null
  // The household's word over tidy up's: its lines can come out.
  for (const food of options.canLeaveOut ?? []) {
    for (const line of recipe.ingredients.getItems()) {
      if (line.mark === "needed" && namesFood(line.rawText, food)) {
        line.mark = "optional"
      }
    }
  }
  await em.flush()
  return loadRecipe(em, recipe.id)
}

/** Rates a recipe, or clears its rating. Not an edit, so no version is kept. */
export async function setRating(
  em: EntityManager,
  options: { recipe: string; rating: number | null }
) {
  const recipe = await findRecipe(em, options.recipe)
  recipe.rating = options.rating
  await em.flush()
  return loadRecipe(em, recipe.id)
}

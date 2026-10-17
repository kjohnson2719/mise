import { clockIn } from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { AppError } from "../../core/errors.ts"
import {
  Discovery,
  Household,
  SiteRecipe,
} from "../../database/entities/index.ts"
import { describeDiscovery } from "../discover/discover.ts"
import {
  dataFor,
  type CollectionData,
  type CollectionRule,
  type Season,
} from "./data.ts"
import { wordPattern } from "./shelf.ts"
import { describeForHousehold, type ShelfRecipeView } from "./sites.ts"

// Starter collections: each a rule plus a few hand-picked classics (data
// files, data.ts), filled from the shelf as the sites post, and fitted to
// the household: what it can't eat left out, what it has already last.

/** The most recipes a collection shows. */
const MOST = 24

/** Fewer than this left for a household, and the collection's hidden. */
const FEWEST = 4

/** A recipe this new comes before the classics. */
const NEW_FOR_MS = 30 * 24 * 60 * 60_000

/** Countries mostly south of the equator, whose seasons are the other way round. */
const SOUTH = new Set([
  "AR",
  "AU",
  "BO",
  "BR",
  "BW",
  "CL",
  "FJ",
  "LS",
  "MG",
  "MU",
  "MW",
  "MZ",
  "NA",
  "NZ",
  "PE",
  "PY",
  "SZ",
  "UY",
  "ZA",
  "ZM",
  "ZW",
])

/** Whether a household's seasons are the southern hemisphere's. */
export function inSouth(household: {
  country?: string | null
  timeZone: string
}) {
  if (household.country) return SOUTH.has(household.country.toUpperCase())
  return /^(Australia\/|Pacific\/Auckland|Africa\/Johannesburg|America\/(Argentina|Santiago|Sao_Paulo|Montevideo))/.test(
    household.timeZone
  )
}

/** The season in a month (1 is January), north of the equator or south. */
export function seasonOf(month: number, south: boolean): Season {
  const northern = south ? ((month + 5) % 12) + 1 : month
  if (northern === 12 || northern <= 2) return "winter"
  if (northern <= 5) return "spring"
  if (northern <= 8) return "summer"
  return "autumn"
}

/** Whether a collection shows this month. */
export function inSeason(rule: CollectionRule, month: number, south: boolean) {
  if (rule.months && !rule.months.includes(month)) return false
  if (rule.seasons && !rule.seasons.includes(seasonOf(month, south))) {
    return false
  }
  return true
}

const patterns = new WeakMap<
  CollectionRule,
  { words?: RegExp; without?: RegExp }
>()

function patternsFor(rule: CollectionRule) {
  let found = patterns.get(rule)
  if (!found) {
    found = {
      words: rule.words ? wordPattern(rule.words) : undefined,
      without: rule.without ? wordPattern(rule.without) : undefined,
    }
    patterns.set(rule, found)
  }
  return found
}

/** Whether a recipe on the shelf fits a collection's rule. */
export function fitsRule(
  rule: CollectionRule,
  recipe: Pick<
    SiteRecipe,
    "name" | "courses" | "keywords" | "diets" | "minutes"
  >
) {
  const { words, without } = patternsFor(rule)
  const said = [recipe.name ?? "", ...recipe.keywords].join("\n")
  if (rule.courses || words) {
    const byCourse =
      rule.courses?.some((course) => recipe.courses.includes(course)) ?? false
    if (!byCourse && !words?.test(said)) return false
  }
  if (without?.test(said)) return false
  if (rule.diets?.some((diet) => !recipe.diets.includes(diet))) return false
  if (
    rule.maxMinutes !== undefined &&
    (recipe.minutes == null || recipe.minutes > rule.maxMinutes)
  ) {
    return false
  }
  return true
}

/**
 * A collection's recipes, best first: what the sites posted this month,
 * then its classics, then the rest newest first.
 */
export function pickFor(
  collection: CollectionData,
  shelf: readonly SiteRecipe[]
) {
  const classics = new Map(
    collection.classics.map((classic, index) => [classic.url, index])
  )
  const newSince = Date.now() - NEW_FOR_MS
  const isNew = (row: SiteRecipe) =>
    !classics.has(row.url) &&
    (row.publishedAt ?? row.createdAt).getTime() >= newSince
  const fits = shelf.filter(
    (row) => classics.has(row.url) || fitsRule(collection.rule, row)
  )
  return [
    ...fits.filter(isNew),
    ...fits
      .filter((row) => classics.has(row.url))
      .sort((a, b) => classics.get(a.url)! - classics.get(b.url)!),
    ...fits.filter((row) => !classics.has(row.url) && !isNew(row)),
  ]
}

/** Every recipe on the shelf that can be shown, newest first. */
function readShelf(em: EntityManager) {
  return em.find(
    SiteRecipe,
    { state: "recipe" },
    { orderBy: { publishedAt: "desc", createdAt: "desc" } }
  )
}

/** The household's month, and whether its seasons are the south's. */
async function householdSeason(em: EntityManager, householdId: string) {
  const household = await em.findOneOrFail(Household, { id: householdId })
  const month = Number(clockIn(household.timeZone).today.slice(5, 7))
  return { month, south: inSouth(household) }
}

/**
 * The shelf as the household sees it, once for every collection: in its
 * library or not, suiting it or not.
 */
async function householdShelf(em: EntityManager, householdId: string) {
  const shelf = await readShelf(em)
  const views = await describeForHousehold(em, householdId, shelf)
  return { shelf, views: new Map(views.map((view) => [view.id, view])) }
}

/** A collection's recipes for the household: those that suit it, unhad first. */
function recipesFor(
  collection: CollectionData,
  { shelf, views }: Awaited<ReturnType<typeof householdShelf>>
) {
  const shown = pickFor(collection, shelf)
    .map((row) => views.get(row.id)!)
    .filter((recipe) => recipe.suits)
  return [
    ...shown.filter((recipe) => !recipe.inLibrary),
    ...shown.filter((recipe) => recipe.inLibrary),
  ].slice(0, MOST)
}

function describeCollection(
  collection: CollectionData,
  recipes: ShelfRecipeView[]
) {
  return {
    id: collection.id,
    title: collection.title,
    description: collection.description,
    theme: collection.theme,
    count: recipes.length,
    /** How many aren't in the library yet. */
    toImport: recipes.filter((recipe) => !recipe.inLibrary).length,
    photos: recipes
      .map((recipe) => recipe.photo)
      .filter((photo) => photo !== null)
      .slice(0, 4),
  }
}

/** The collections showing for the household now, with enough in them. */
export async function listCollections(
  em: EntityManager,
  householdId: string,
  language: string
) {
  const { month, south } = await householdSeason(em, householdId)
  const seen = await householdShelf(em, householdId)
  const collections = []
  for (const collection of dataFor(language).collections) {
    if (!inSeason(collection.rule, month, south)) continue
    const recipes = recipesFor(collection, seen)
    if (recipes.length < FEWEST) continue
    collections.push(describeCollection(collection, recipes))
  }
  return collections
}

/** A collection, by its id in the person's language. */
export function findCollection(language: string, id: string) {
  const collection = dataFor(language).collections.find(
    (found) => found.id === id
  )
  if (!collection) {
    throw new AppError(
      "not_found",
      "collection_not_found",
      "There's no such collection."
    )
  }
  return collection
}

/**
 * A collection with its recipes, and what Find more found for it last, or
 * is finding.
 */
export async function getCollection(
  em: EntityManager,
  householdId: string,
  language: string,
  id: string
) {
  const collection = findCollection(language, id)
  const recipes = recipesFor(collection, await householdShelf(em, householdId))
  const search = await em.findOne(
    Discovery,
    { collection: collection.id },
    { orderBy: { createdAt: "desc", id: "desc" } }
  )
  return {
    ...describeCollection(collection, recipes),
    recipes,
    found: search ? describeDiscovery(search) : null,
  }
}

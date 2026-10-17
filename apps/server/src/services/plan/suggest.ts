import {
  addDays,
  checkTastes,
  clockIn,
  dayOfWeek,
  fitsTheme,
  lineFoods,
  missingDiets,
  NO_TASTES,
  NO_THEMES,
  covers,
  foodKey,
  reasonsFor,
  saleNudge,
  themeLabel,
  worthIt,
  worthSaying,
  WEEKNIGHTS,
  type Diet,
  type IngredientMark,
  type Meal,
  type NightTheme,
  type Reason,
} from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import {
  Household,
  PlanEntry,
  Recipe,
  RecipeIngredient,
  RecipePairing,
} from "../../database/entities/index.ts"
import { householdKeys } from "../list/food-aliases.ts"
import { getPantry } from "../pantry/pantry.ts"
import { decodeDiets } from "../recipes/diet-labels.ts"
import { photoUrls } from "../recipes/photos.ts"
import { toNumber, totalMinutes } from "../recipes/recipes.ts"
import { tagKey, tagsOf } from "../recipes/tags.ts"
import type { SuggestBudget } from "../stores/costs.ts"
import type { RecipeSale, SuggestSales } from "../stores/prices.ts"

// Fill the week, without AI: a recipe for each empty meal, by the
// household's tastes and theme nights, not repeating a dish within two
// weeks, picked at random with a lean towards recipes that use up what's
// at home and needs using, ones with real deals at the household's store
// (as much as it leans on sales), well-rated ones, ones tagged for the
// meal and quick ones on weeknights. Each says why.

/** Don't suggest what was planned (and not skipped) or made this many days around. */
const NO_REPEAT_DAYS = 14

/** Tags that say which meal a recipe is for. */
const MEAL_TAGS: Record<Meal, string[]> = {
  breakfast: ["breakfast", "brunch"],
  lunch: ["lunch", "salad", "sandwich", "soup"],
  dinner: ["dinner", "main", "main course", "main dish", "entree", "supper"],
  snack: ["snack", "appetizer", "dessert"],
}

/** Tags for parts of a meal rather than meals: never suggested on their own. */
const PART_TAGS = [
  "sauce",
  "sauces",
  "dressing",
  "dressings",
  "condiment",
  "condiments",
  "marinade",
  "seasoning",
  "spice blend",
  "spice mix",
  "glaze",
  "frosting",
  "topping",
]

export type Slot = { date: string; meal: Meal }

/** A recipe as the suggester sees it. */
type Candidate = {
  id: string
  slug: string
  name: string
  photo: string | null
  servings: number | null
  totalMinutes: number | null
  rating: number | null
  lastMadeAt: Date | null
  /** Its tag names, lowercased. */
  tags: string[]
  diets: Diet[]
  lines: string[]
  /** What each line is to the dish, as tidy up marked it. */
  marks: (IngredientMark | null)[]
  /** Foods the household said it can't do without. */
  needs: string[]
}

export type Suggestion = Slot & {
  recipe: Pick<
    Candidate,
    "id" | "slug" | "name" | "photo" | "servings" | "totalMinutes"
  >
  /** A sauce or side it goes with, picked to go with it. */
  withRecipe: { id: string; slug: string; name: string } | null
  why: Reason[]
}

/**
 * Which recipes suit a meal. Breakfast, lunch and snacks only take recipes
 * tagged for them; dinner takes anything that isn't clearly another meal.
 */
function fitsMeal(recipe: Candidate, meal: Meal) {
  if (MEAL_TAGS[meal].some((tag) => recipe.tags.includes(tag))) return true
  if (meal !== "dinner") return false
  const other = [
    ...MEAL_TAGS.breakfast,
    ...MEAL_TAGS.snack,
    "drink",
    "cocktail",
  ]
  return !other.some((tag) => recipe.tags.includes(tag))
}

const isWeeknightDinner = (slot: Slot) =>
  slot.meal === "dinner" && WEEKNIGHTS.includes(dayOfWeek(slot.date))

/**
 * Higher is likelier: uses up what needs using, well rated, tagged for the
 * meal, quick on weeknights, and made as written rather than leaving
 * something out.
 */
function weight(
  recipe: Candidate,
  slot: Slot,
  usesUp: number,
  leavesOut: boolean,
  onSale: number
) {
  let score = leavesOut ? 0.5 : 1
  if (usesUp > 0) score += 2 + (usesUp - 1) * 0.5
  score += onSale
  if (recipe.rating) {
    score += recipe.rating >= 4 ? 2 : recipe.rating <= 2 ? -0.75 : 0.5
  } else if (!recipe.lastMadeAt) score += 0.5 // something new to try
  if (MEAL_TAGS[slot.meal].some((tag) => recipe.tags.includes(tag))) score += 1
  if (isWeeknightDinner(slot) && recipe.totalMinutes) {
    score += recipe.totalMinutes <= 45 ? 1 : recipe.totalMinutes > 75 ? -0.5 : 0
  }
  return Math.max(score, 0.1)
}

function pick<T>(
  items: readonly T[],
  weightOf: (item: T) => number,
  random: () => number
) {
  const total = items.reduce((sum, item) => sum + weightOf(item), 0)
  let roll = random() * total
  for (const item of items) {
    roll -= weightOf(item)
    if (roll <= 0) return item
  }
  return items.at(-1)
}

/**
 * A recipe and its versions ("Pancakes" and "Pancakes (dairy-free)") count
 * as one dish, so they aren't suggested in the same fortnight.
 */
const dish = (name: string) =>
  name
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim()
    .toLowerCase()

/** Every recipe in the household, with what the suggester needs of it. */
async function candidates(em: EntityManager): Promise<Candidate[]> {
  const recipes = await em.find(Recipe, {})
  const ids = recipes.map((recipe) => recipe.id)
  const tags = await tagsOf(em, ids)
  const lines = new Map<string, RecipeIngredient[]>()
  if (ids.length > 0) {
    for (const line of await em.find(
      RecipeIngredient,
      { recipe: { $in: ids } },
      { orderBy: { position: "asc" } }
    )) {
      const list = lines.get(line.recipe.id)
      if (list) list.push(line)
      else lines.set(line.recipe.id, [line])
    }
  }
  return recipes.map((recipe) => ({
    id: recipe.id,
    slug: recipe.slug,
    name: recipe.name,
    photo: photoUrls(recipe)?.card ?? null,
    servings: toNumber(recipe.servings),
    totalMinutes: totalMinutes(recipe),
    rating: recipe.rating ?? null,
    lastMadeAt: recipe.lastMadeAt ?? null,
    tags: (tags.get(recipe.id) ?? []).map(tagKey),
    diets: decodeDiets(recipe.diets),
    lines: (lines.get(recipe.id) ?? []).map((line) => line.rawText),
    marks: (lines.get(recipe.id) ?? []).map((line) => line.mark ?? null),
    needs: recipe.needs ?? [],
  }))
}

/** What each recipe goes with: the recipes it pairs with, a tag's included. */
async function pairingOptions(em: EntityManager, recipes: Candidate[]) {
  const rules = await em.find(RecipePairing, {})
  const options = new Map<string, Set<string>>()
  for (const rule of rules) {
    const ids = rule.pairedRecipe
      ? [rule.pairedRecipe.id]
      : recipes
          .filter((recipe) => rule.tagKey && recipe.tags.includes(rule.tagKey))
          .map((recipe) => recipe.id)
    const set = options.get(rule.recipe.id) ?? new Set<string>()
    for (const id of ids) if (id !== rule.recipe.id) set.add(id)
    options.set(rule.recipe.id, set)
  }
  return options
}

/**
 * Suggests a recipe for each slot without repeating a dish across the
 * slots or within two weeks of being planned or made. Theme nights are
 * filled first, those with the fewest recipes that fit before the others.
 * Slots with nothing suitable are left out.
 */
export async function suggestMeals(
  em: EntityManager,
  householdId: string,
  slots: readonly Slot[],
  options: {
    exclude?: readonly string[]
    random?: () => number
    /** What's on sale at the household's store, and how much to lean. */
    sales?: SuggestSales | null
    /** What's left of the weekly budget for each meal, and what recipes cost. */
    budget?: SuggestBudget | null
  } = {}
): Promise<Suggestion[]> {
  const keyOf = await householdKeys(em)
  if (slots.length === 0) return []
  const random = options.random ?? Math.random
  const household = await em.findOneOrFail(Household, { id: householdId })
  const tastes = { ...NO_TASTES, ...household.settings?.tastes }
  const themes = household.settings?.themes ?? NO_THEMES
  const { today } = clockIn(household.timeZone)

  const recipes = await candidates(em)
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]))

  // What's at home and needs using soon, and the recipes that use it.
  const soon = (await getPantry(em, householdId)).items.filter(
    (item) => item.useSoon
  )
  const usesUp = new Map(
    recipes.map((recipe) => {
      const keys = [
        ...new Set(
          recipe.lines.flatMap((line) =>
            lineFoods(line).map((food) => keyOf(food.name))
          )
        ),
      ]
      // What's at home uses up a recipe's food, or a food it's a kind of:
      // the green bell pepper, a recipe's bell pepper.
      const foods = soon
        .filter((item) => {
          const have = keyOf(item.name)
          return keys.some((need) => covers(have, need))
        })
        .map((item) => item.name.toLowerCase())
      return [recipe.id, [...new Set(foods)]] as const
    })
  )
  // Real deals it uses, and how much likelier they make it.
  const deals = (recipe: Candidate): RecipeSale[] =>
    (options.sales?.recipes.get(recipe.id) ?? []).filter((sale) =>
      worthIt(sale.verdict)
    )
  const nudge = (recipe: Candidate) =>
    options.sales ? saleNudge(deals(recipe), options.sales.lean) : 0
  // With a budget, recipes that fit what's left of it are picked more,
  // and ones well over it less.
  const fits = (recipe: Candidate) => {
    const cost = options.budget?.costOf.get(recipe.id)
    if (!options.budget || cost === undefined) return 1
    const { perMeal } = options.budget
    return cost <= perMeal ? 1.3 : cost <= perMeal * 1.5 ? 1 : 0.5
  }
  const dates = slots.map((slot) => slot.date).sort()
  const nearby = await em.find(PlanEntry, {
    date: {
      $gte: addDays(dates[0]!, -NO_REPEAT_DAYS),
      $lte: addDays(dates.at(-1)!, NO_REPEAT_DAYS),
    },
    // A skipped meal wasn't eaten, so it can come round again.
    status: { $ne: "skipped" },
  })
  const used = new Set<string>(
    [
      ...(options.exclude ?? []),
      ...nearby.flatMap((entry) => (entry.recipe ? [entry.recipe.id] : [])),
    ]
      .map((id) => byId.get(id))
      .filter((recipe) => recipe !== undefined)
      .map((recipe) => dish(recipe.name))
  )
  const madeLately = new Date(
    new Date(`${today}T00:00:00Z`).getTime() - NO_REPEAT_DAYS * 86_400_000
  )

  // The household's rules: foods nobody should get or that are left out,
  // diets every meal fits, and how long weeknight dinners can take.
  const checks = new Map(
    recipes.map((recipe) => [recipe.id, checkTastes(recipe, tastes.avoid)])
  )
  const leaveOut = (recipe: Candidate) => checks.get(recipe.id)?.leaveOut ?? []
  const ruledOut = new Set(
    recipes
      .filter(
        (recipe) =>
          missingDiets(recipe.diets, tastes.diets).length > 0 ||
          (checks.get(recipe.id)?.ruledOut.length ?? 0) > 0
      )
      .map((recipe) => recipe.id)
  )
  const tooLong = (recipe: Candidate, slot: Slot) =>
    tastes.weeknightMinutes !== null &&
    isWeeknightDinner(slot) &&
    recipe.totalMinutes !== null &&
    recipe.totalMinutes > tastes.weeknightMinutes

  // What goes with what. Anything offered with another recipe is a part of
  // a meal (a sauce), not a meal.
  const pairings = await pairingOptions(em, recipes)
  const parts = new Set([...pairings.values()].flatMap((ids) => [...ids]))
  const isPart = (recipe: Candidate) =>
    parts.has(recipe.id) || recipe.tags.some((tag) => PART_TAGS.includes(tag))
  const pairedLately = new Set(
    nearby.flatMap((entry) => (entry.withRecipe ? [entry.withRecipe.id] : []))
  )

  // Theme nights are for dinner: tacos on Tuesday, eat out on Friday.
  const themeOf = (slot: Slot): NightTheme | null =>
    slot.meal === "dinner" ? (themes[dayOfWeek(slot.date)] ?? null) : null

  /**
   * What could go in a slot. On a theme night, what fits the theme; when
   * nothing does, everything else, unless `strict`.
   */
  const candidatesFor = (slot: Slot, strict = false) => {
    const all = recipes.filter(
      (recipe) =>
        !isPart(recipe) &&
        !ruledOut.has(recipe.id) &&
        !tooLong(recipe, slot) &&
        !used.has(dish(recipe.name)) &&
        fitsMeal(recipe, slot.meal) &&
        !(recipe.lastMadeAt && recipe.lastMadeAt > madeLately)
    )
    const theme = themeOf(slot)
    if (!theme) return all
    if (theme.kind === "skip") return []
    const themed = all.filter((recipe) => fitsTheme(recipe, theme))
    return themed.length > 0 || strict ? themed : all
  }

  // Theme nights first, those with the fewest recipes that fit before the
  // others, so a fish night isn't left without the one fish recipe because
  // a night with no theme took it.
  const UNTHEMED = 1_000_000
  const themedCount = (slot: Slot) => {
    const theme = themeOf(slot)
    if (!theme || theme.kind === "skip") return UNTHEMED
    return candidatesFor(slot, true).length || UNTHEMED
  }
  const order = [...slots.entries()].sort(
    ([, a], [, b]) => themedCount(a) - themedCount(b)
  )
  const chosen = new Map<number, Candidate>()
  for (const [index, slot] of order) {
    const recipe = pick(
      candidatesFor(slot),
      (r) =>
        weight(
          r,
          slot,
          usesUp.get(r.id)?.length ?? 0,
          leaveOut(r).length > 0,
          nudge(r)
        ) * fits(r),
      random
    )
    if (!recipe) continue
    chosen.set(index, recipe)
    used.add(dish(recipe.name))
  }

  /** A sauce or side for it, one not had lately, different each night. */
  const pickedWith = new Set<string>()
  function pairWith(recipe: Candidate) {
    const found = [...(pairings.get(recipe.id) ?? [])].flatMap((id) => {
      const option = byId.get(id)
      return option && !ruledOut.has(option.id) ? [option] : []
    })
    if (found.length === 0) return null
    const fresh = found.filter(
      (option) => !pairedLately.has(option.id) && !pickedWith.has(option.id)
    )
    const option = pick(
      fresh.length > 0 ? fresh : found,
      (o) => o.rating ?? 3,
      random
    )!
    pickedWith.add(option.id)
    return { id: option.id, slug: option.slug, name: option.name }
  }

  return slots.flatMap((slot, index) => {
    const recipe = chosen.get(index)
    if (!recipe) return []
    const theme = themeOf(slot)
    return [
      {
        ...slot,
        recipe: {
          id: recipe.id,
          slug: recipe.slug,
          name: recipe.name,
          photo: recipe.photo,
          servings: recipe.servings,
          totalMinutes: recipe.totalMinutes,
        },
        withRecipe: pairWith(recipe),
        why: reasonsFor(recipe, {
          today,
          theme: theme
            ? { label: themeLabel(theme), fits: fitsTheme(recipe, theme) }
            : null,
          weeknightDinner: isWeeknightDinner(slot),
          usesUp: (usesUp.get(recipe.id) ?? []).slice(0, 2),
          // Said for what changes dinner: chicken on sale, not flour.
          onSale: options.sales
            ? {
                foods: deals(recipe)
                  .filter(worthSaying)
                  .map((sale) => sale.name)
                  .slice(0, 2),
                lowest: deals(recipe).some(
                  (sale) => worthSaying(sale) && sale.verdict === "lowest"
                ),
              }
            : null,
          leaveOut: leaveOut(recipe),
        }),
      },
    ]
  })
}

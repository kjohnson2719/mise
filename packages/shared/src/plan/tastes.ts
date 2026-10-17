import { canRead, dietsFor, type Diet } from "../diets/diets.ts"
import { isMarked, type IngredientMark } from "../recipes/marks.ts"

// What a household eats and doesn't: foods to avoid (allergies among them),
// diets every meal must fit, and how long weeknight dinners can take. Fill
// the week and the autoplan keep to them, without AI.

/**
 * How firmly a food is avoided. With an allergy or never, recipes that
 * have it aren't suggested. With leave it out, they are, with its lines
 * crossed off, unless it's what the dish is.
 */
export const AVOID_LEVELS = ["allergy", "never", "leave-out"] as const
export type AvoidLevel = (typeof AVOID_LEVELS)[number]

/** A food the household doesn't eat: how firmly, and who it's for. */
export type AvoidedFood = {
  food: string
  level: AvoidLevel
  /** Who doesn't eat it, when it isn't everyone: "Emma". */
  who: string | null
}

export type HouseholdTastes = {
  avoid: AvoidedFood[]
  /** Diets every meal must fit, like vegetarian. */
  diets: Diet[]
  /** Dinners Monday to Thursday take at most this long. */
  weeknightMinutes: number | null
}

export const NO_TASTES: HouseholdTastes = {
  avoid: [],
  diets: [],
  weeknightMinutes: null,
}

/** Choices for the weeknight dinner limit. */
export const WEEKNIGHT_MINUTES = [30, 45, 60] as const

/** Dinners on these days count as weeknights: Monday to Thursday. */
export const WEEKNIGHTS: readonly number[] = [1, 2, 3, 4]

/**
 * Foods a diet label already checks carefully ("nuts" covers pesto and
 * almond flour, "dairy" covers butter and parmesan), so avoiding them uses
 * the label rather than the word.
 */
const FOOD_DIETS: Record<string, Diet> = {
  nut: "nut-free",
  nuts: "nut-free",
  "tree nut": "nut-free",
  "tree nuts": "nut-free",
  dairy: "dairy-free",
  "milk products": "dairy-free",
  gluten: "gluten-free",
  wheat: "gluten-free",
  egg: "egg-free",
  eggs: "egg-free",
  meat: "vegetarian",
}

const foodKey = (food: string) => food.trim().toLowerCase()

/**
 * Whether a food can be picked out of a recipe. Nuts, dairy, gluten, eggs
 * and meat are in too many things (pesto, butter, pasta, mayonnaise, stock)
 * to cross off a line, so they're never suggested instead.
 */
export const canLeaveOut = (food: string) => !FOOD_DIETS[foodKey(food)]

/** The level a food is avoided at in practice: see `canLeaveOut`. */
export const levelOf = (item: AvoidedFood): AvoidLevel =>
  item.level === "leave-out" && !canLeaveOut(item.food) ? "never" : item.level

/** "mushroom" also matches "mushrooms", "berry" matches "berries", and so on. */
function foodPattern(food: string) {
  const base = food
    .trim()
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, "")
    .replace(/\s+/g, " ")
  if (!base) return null
  const forms = new Set([base])
  if (base.endsWith("ies")) forms.add(`${base.slice(0, -3)}y`)
  else if (base.endsWith("es")) forms.add(base.slice(0, -2))
  if (base.endsWith("s")) forms.add(base.slice(0, -1))
  else {
    forms.add(`${base}s`)
    forms.add(`${base}es`)
    if (base.endsWith("y")) forms.add(`${base.slice(0, -1)}ies`)
  }
  const words = [...forms].map((form) =>
    form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+")
  )
  return new RegExp(`\\b(?:${words.join("|")})\\b`, "i")
}

/**
 * The household's avoided foods a recipe's ingredients have. `diets` are
 * the recipe's labels as shown (corrections and all); without them they're
 * worked out from the lines.
 *
 * Allergies are never left to chance: lines Merran can't read (a recipe
 * kept in Arabic, say) may have any of them. Foods someone just doesn't eat
 * only count where they're found, as counting them everywhere would take
 * every recipe it can't read off the plan for one disliked food, and a
 * dish with it gets picked around. Those the diet labels check (nuts,
 * dairy, meat...) still count, as a recipe it can't read has no labels.
 */
export function avoidedIn(
  lines: readonly string[],
  avoid: readonly AvoidedFood[],
  diets?: readonly Diet[]
): AvoidedFood[] {
  if (avoid.length === 0 || lines.length === 0) return []
  const text = lines.join("\n")
  const unread = !canRead(lines)
  let labels = diets
  return avoid.filter((item) => {
    if (unread && item.level === "allergy") return true
    const diet = FOOD_DIETS[foodKey(item.food)]
    if (diet) {
      labels ??= dietsFor(lines)
      return !labels.includes(diet)
    }
    return foodPattern(item.food)?.test(text) ?? false
  })
}

/** Whether text names a food, in any of its forms: "Mushrooms" names "mushroom". */
export const namesFood = (text: string, food: string) =>
  foodPattern(food)?.test(text) ?? false

/** A food to leave out of a recipe, and the lines it's in. */
export type LeftOut = {
  food: string
  who: string | null
  /** Where it is in the recipe's lines, from 0. */
  lines: number[]
  /** It matters to the dish, and another food could stand in for it. */
  swap: boolean
}

/**
 * Why a recipe can't do without a dislike: it's in the name (Mushroom
 * Risotto), the household said so, or tidy up marked it needed.
 */
export type NeededBy = "name" | "household" | "mark"

/** A dislike a recipe can't do without, so it's ruled out. */
export type Needed = { food: string; who: string | null; by: NeededBy }

/** What a household's avoided foods make of a recipe. */
export type TasteCheck = {
  /**
   * The foods that keep it from being suggested: allergies, ones never
   * eaten, and dislikes it can't do without.
   */
  ruledOut: AvoidedFood[]
  /** Dislikes it can do without: cross these lines off. */
  leaveOut: LeftOut[]
  /** The dislikes among `ruledOut` it can't do without, and why. */
  needed: Needed[]
  /**
   * The foods among `ruledOut` it couldn't be checked for, as Merran can't
   * read its ingredients: allergies, and the foods the diet labels check.
   */
  unchecked: AvoidedFood[]
}

/**
 * A recipe against the household's avoided foods. A dislike to leave out
 * is crossed off its lines, unless the recipe can't do without it: the
 * household said it needs it, or tidy up marked a line of it needed. A
 * recipe not marked yet can't do without what it's named for (Mushroom
 * Risotto). Then it's ruled out like the rest.
 */
export function checkTastes(
  recipe: {
    name: string
    lines: readonly string[]
    /** What each line is to the dish, as tidy up marked it, by line. */
    marks?: readonly (IngredientMark | null)[] | null
    /** Its diet labels as shown, corrections and all. */
    diets?: readonly Diet[]
    /** Foods the household said it can't do without. */
    needs?: readonly string[] | null
  },
  avoid: readonly AvoidedFood[]
): TasteCheck {
  const check: TasteCheck = {
    ruledOut: [],
    leaveOut: [],
    needed: [],
    unchecked: [],
  }
  if (avoid.length === 0 || recipe.lines.length === 0) return check
  check.ruledOut = avoidedIn(
    recipe.lines,
    avoid.filter((item) => levelOf(item) !== "leave-out"),
    recipe.diets
  )
  if (!canRead(recipe.lines)) {
    check.unchecked = check.ruledOut.filter(
      (item) => item.level === "allergy" || !canLeaveOut(item.food)
    )
  }
  for (const item of avoid) {
    if (levelOf(item) !== "leave-out") continue
    const pattern = foodPattern(item.food)
    if (!pattern) continue
    const lines = recipe.lines.flatMap((line, index) =>
      pattern.test(line) ? [index] : []
    )
    if (lines.length === 0) continue
    const marked = isMarked(recipe.marks)
    const markOf = (line: number) => recipe.marks?.[line] ?? null
    const by: NeededBy | null = (recipe.needs ?? []).some((food) =>
      pattern.test(food)
    )
      ? "household"
      : marked
        ? lines.some((line) => markOf(line) === "needed")
          ? "mark"
          : null
        : pattern.test(recipe.name)
          ? "name"
          : null
    if (by) {
      check.ruledOut.push(item)
      check.needed.push({ food: item.food, who: item.who, by })
    } else {
      check.leaveOut.push({
        food: item.food,
        who: item.who,
        lines,
        swap: lines.some((line) => markOf(line) === "swappable"),
      })
    }
  }
  return check
}

/** The lines a recipe is made without, by the household's dislikes. */
export function leftOutLines(
  recipe: Parameters<typeof checkTastes>[0],
  avoid: readonly AvoidedFood[]
) {
  return new Set(
    checkTastes(recipe, avoid).leaveOut.flatMap((item) => item.lines)
  )
}

/** The diets every meal must fit that a recipe doesn't. */
export function missingDiets(
  recipeDiets: readonly Diet[],
  required: readonly Diet[]
) {
  return required.filter((diet) => !recipeDiets.includes(diet))
}

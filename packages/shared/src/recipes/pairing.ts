import type { Diet } from "../diets/diets.ts"
import { scaleIngredient } from "../ingredients/display.ts"
import { joinSections } from "../ingredients/sections.ts"

// "Goes with": a recipe and one it's paired with, like chicken and the sauce
// that goes on it, shown and cooked as one.

type Line = { id: string; section: string | null; text: string }

/** What pairing needs of a recipe. */
export type PairPart<I extends Line = Line, S extends Line = Line> = {
  id: string
  name: string
  servings: number | null
  totalMinutes: number | null
  diets: readonly Diet[]
  ingredients: readonly I[]
  steps: readonly S[]
}

/**
 * How much of the paired recipe goes with the base: enough for the same
 * number of servings when both say how many they make, else one batch per
 * batch of the base.
 */
export function pairingFactor(
  base: Pick<PairPart, "servings">,
  paired: Pick<PairPart, "servings">,
  baseFactor = 1
) {
  return base.servings && paired.servings
    ? (base.servings * baseFactor) / paired.servings
    : baseFactor
}

/** "Teriyaki Sauce · For the glaze", or just the recipe's name. */
const heading = (part: Pick<PairPart, "name">, section: string | null) =>
  section ? `${part.name} · ${section}` : part.name

/**
 * A recipe and what it's paired with, as one: the pairing's ingredients and
 * steps first (sauces get made first), each part under its own heading, the
 * pairing scaled to the same servings, and only the diet labels both have.
 */
export function pairRecipes<I extends Line, S extends Line>(
  base: PairPart<I, S>,
  paired: PairPart<I, S>,
  baseFactor = 1
) {
  const factor = pairingFactor(base, paired, baseFactor)
  /** Under the part's own heading, and saying which recipe it's from. */
  const relabel = <T extends Line>(part: PairPart<I, S>, items: readonly T[]) =>
    items.map((item) => ({
      ...item,
      section: heading(part, item.section),
      from: part.id,
    }))
  return {
    /** How much of the pairing is made. */
    factor,
    ingredients: [
      ...relabel(paired, paired.ingredients),
      ...relabel(base, base.ingredients),
    ],
    steps: [...relabel(paired, paired.steps), ...relabel(base, base.steps)],
    /** How much each line is scaled, by ingredient id. */
    factors: new Map<string, number>([
      ...paired.ingredients.map((line): [string, number] => [line.id, factor]),
      ...base.ingredients.map((line): [string, number] => [
        line.id,
        baseFactor,
      ]),
    ]),
    diets: base.diets.filter((diet) => paired.diets.includes(diet)),
    totalMinutes:
      base.totalMinutes !== null || paired.totalMinutes !== null
        ? (base.totalMinutes ?? 0) + (paired.totalMinutes ?? 0)
        : null,
  }
}

/**
 * The pair as editor lines for a recipe of its own ("Save as its own
 * recipe"): each part under its own headings, the pairing scaled to the
 * base's servings.
 */
export function pairedRecipeLines(base: PairPart, paired: PairPart) {
  const factor = pairingFactor(base, paired)
  const lines = (part: PairPart, items: readonly Line[], scale: number) =>
    items.map((item) => ({
      section: heading(part, item.section),
      text: scale === 1 ? item.text : scaleIngredient(item.text, scale),
    }))
  return {
    servings: base.servings,
    totalMinutes: pairRecipes(base, paired).totalMinutes,
    ingredients: joinSections([
      ...lines(paired, paired.ingredients, factor),
      ...lines(base, base.ingredients, 1),
    ]),
    steps: joinSections([
      ...lines(paired, paired.steps, 1),
      ...lines(base, base.steps, 1),
    ]),
  }
}

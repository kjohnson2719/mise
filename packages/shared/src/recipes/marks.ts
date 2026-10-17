// What a recipe can do without, ingredient by ingredient, as tidy up marks
// it: so a dislike is left out of a dish that can do without it, and rules
// out one that can't, without leaning on the recipe's name.

/**
 * - needed: the dish can't do without it (the chicken in a chicken curry,
 *   the flour in bread)
 * - swappable: it matters, but another food can stand in (the zucchini in
 *   a stir fry)
 * - optional: it can simply be left out (a garnish, nuts on top)
 */
export const INGREDIENT_MARKS = ["needed", "swappable", "optional"] as const
export type IngredientMark = (typeof INGREDIENT_MARKS)[number]

/** Whether a recipe's lines have been marked, by tidy up or by hand. */
export const isMarked = (
  marks: readonly (IngredientMark | null)[] | null | undefined
) => marks?.some((mark) => mark !== null) ?? false

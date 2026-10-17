// Saying why: one reason builder for every suggestion, from Fill the week
// and the autoplan now, and later Today and the assistant. Each reason is
// data, so the app says it in the reader's language; a later slice adds
// usual buys.

export type Reason =
  /** The night's theme, which it fits: "Taco night". */
  | { kind: "theme"; label: string }
  /** Nothing fitted the night's theme, so it's something else. */
  | { kind: "themeMissed"; label: string }
  /** It uses up food at home that needs using soon: "spinach". */
  | { kind: "usesUp"; foods: string[] }
  /**
   * It uses food on sale at the household's store: "chicken thighs",
   * `lowest` when one is the lowest it's been in a while.
   */
  | { kind: "onSale"; foods: string[]; lowest: boolean }
  /** Never made yet. */
  | { kind: "new" }
  /** Not had in a while. */
  | { kind: "notLately"; weeks: number }
  /** Rated well: 4 or 5 stars. */
  | { kind: "rated"; stars: number }
  /** Quick enough for a weeknight dinner. */
  | { kind: "quick"; minutes: number }
  /**
   * Not a reason but a note: made without foods someone doesn't like.
   * "Leave out the mushrooms (Emma)".
   */
  | { kind: "leaveOut"; foods: { food: string; who: string | null }[] }

/** What the reason builder looks at. */
export type ReasonRecipe = {
  rating: number | null
  totalMinutes: number | null
  /** When it was last made, or null for never. */
  lastMadeAt: string | Date | null
}

/** Two at most: enough to say why, not so many it's noise. */
const MOST = 2

/**
 * Why a recipe was picked for a meal, strongest first: the night's theme,
 * then food at home it uses up, then food on sale, then something new or
 * not had lately, then a good rating, then quick on a weeknight.
 */
export function reasonsFor(
  recipe: ReasonRecipe,
  {
    today,
    theme,
    weeknightDinner,
    usesUp = [],
    onSale = null,
    leaveOut = [],
  }: {
    /** The household's today, "2026-10-15". */
    today: string
    theme: { label: string; fits: boolean } | null
    weeknightDinner: boolean
    /** Food at home to use soon that it uses. */
    usesUp?: readonly string[]
    /** Food on sale that it uses, worth changing a meal for. */
    onSale?: { foods: readonly string[]; lowest: boolean } | null
    /** Dislikes it's made without, always said, after the reasons. */
    leaveOut?: readonly { food: string; who: string | null }[]
  }
): Reason[] {
  const reasons: Reason[] = []
  if (theme) {
    reasons.push(
      theme.fits
        ? { kind: "theme", label: theme.label }
        : { kind: "themeMissed", label: theme.label }
    )
  }
  if (usesUp.length > 0) reasons.push({ kind: "usesUp", foods: [...usesUp] })
  if (onSale && onSale.foods.length > 0) {
    reasons.push({
      kind: "onSale",
      foods: [...onSale.foods],
      lowest: onSale.lowest,
    })
  }
  if (recipe.lastMadeAt === null) reasons.push({ kind: "new" })
  else {
    const made = new Date(recipe.lastMadeAt).getTime()
    const weeks = Math.floor(
      (new Date(`${today}T00:00:00Z`).getTime() - made) / (7 * 86_400_000)
    )
    if (weeks >= 3) reasons.push({ kind: "notLately", weeks })
  }
  if (recipe.rating !== null && recipe.rating >= 4) {
    reasons.push({ kind: "rated", stars: recipe.rating })
  }
  if (
    weeknightDinner &&
    recipe.totalMinutes !== null &&
    recipe.totalMinutes <= 45
  ) {
    reasons.push({ kind: "quick", minutes: recipe.totalMinutes })
  }
  const why = reasons.slice(0, MOST)
  if (leaveOut.length > 0) {
    why.push({
      kind: "leaveOut",
      foods: leaveOut.map(({ food, who }) => ({ food, who })),
    })
  }
  return why
}

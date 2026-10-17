// Words that describe an ingredient, or how much of it, rather than name it.
const DESCRIPTIVE = new Set(
  (
    "all purpose fresh large small medium extra virgin chopped minced diced " +
    "sliced ground whole dried finely roughly thinly freshly packed softened " +
    "melted cold warm room temperature boneless skinless optional divided " +
    "plus more less for serving taste and the into pieces piece about natural " +
    "can cans tin tins jar jars pack packet bunch handful pinch heaped level " +
    "good few some red green yellow white black brown"
  ).split(" ")
)

/** The words a step might use for a food: "garlic cloves" → garlic, clove, cloves… */
export function foodWords(food: string) {
  return food
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((word) => word.length >= 3 && !DESCRIPTIVE.has(word))
    .flatMap((word) =>
      word.endsWith("es") && word.length > 4
        ? [word, word.slice(0, -2), word.slice(0, -1)]
        : word.endsWith("s") && word.length > 3
          ? [word, word.slice(0, -1)]
          : [word, `${word}s`]
    )
}

/** The ingredients a step mentions by name, by id: "Add the garlic" → the garlic. */
export function ingredientsInStep(
  step: string,
  ingredients: readonly { id: string; food: string | null }[]
) {
  const words = new Set(step.toLowerCase().split(/[^a-z]+/))
  const used = new Set<string>()
  for (const ingredient of ingredients) {
    if (!ingredient.food) continue
    if (foodWords(ingredient.food).some((word) => words.has(word))) {
      used.add(ingredient.id)
    }
  }
  return used
}

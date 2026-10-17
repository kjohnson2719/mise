// Nutrition per serving: the seven numbers Merran shows, and where they
// came from.

export const NUTRIENT_KEYS = [
  "calories",
  "protein",
  "carbs",
  "fat",
  "fiber",
  "sugar",
  "sodium",
] as const
export type NutrientKey = (typeof NUTRIENT_KEYS)[number]

/** Per serving, or per 100 g for a USDA food; null when unknown. */
export type NutrientValues = Record<NutrientKey, number | null>

/** Calories in kcal, sodium in mg, the rest in grams. */
export const NUTRIENT_UNITS: Record<NutrientKey, "kcal" | "g" | "mg"> = {
  calories: "kcal",
  protein: "g",
  carbs: "g",
  fat: "g",
  fiber: "g",
  sugar: "g",
  sodium: "mg",
}

/** Whole calories and milligrams; grams to a tenth. */
export function roundNutrient(key: NutrientKey, value: number) {
  return NUTRIENT_UNITS[key] === "g"
    ? Math.round(value * 10) / 10
    : Math.round(value)
}

/** Each value times `factor`, rounded: for a recipe made at another size. */
export function scaleNutrients<T extends Partial<NutrientValues>>(
  values: T,
  factor: number
): T {
  const scaled: Partial<NutrientValues> = { ...values }
  for (const key of NUTRIENT_KEYS) {
    const value = values[key]
    if (typeof value === "number")
      scaled[key] = roundNutrient(key, value * factor)
  }
  return scaled as T
}

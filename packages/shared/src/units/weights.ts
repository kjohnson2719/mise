import { gramsPerCup } from "../foods/vocabulary.ts"
import { foodKey } from "../list/food.ts"

const ML_PER_CUP = 236.588

/**
 * Grams per millilitre for a food whose cup Merran knows the weight of
 * ("all-purpose flour", "packed light brown sugar", the first of "kosher
 * salt or sea salt"), or null: the food vocabulary's grams per cup
 * (docs/foods.md). Not what's been cooked, melted or whipped, which
 * weighs something else.
 */
export function bakingDensity(food: string): number | null {
  if (/\b(cooked|melted|whipped)\b/i.test(food)) return null
  const grams = gramsPerCup(foodKey(food))
  return grams === null ? null : grams / ML_PER_CUP
}

/**
 * Liquids, which metric recipes measure by volume even though they could
 * be weighed. Not "cream cheese" or "sour cream", which are weighed.
 */
const LIQUID =
  /\b(water|milk|buttermilk|(heavy|whipping|double|light|single) cream|half[- ]and[- ]half|oil|stock|broth|juice|wine|vinegar)\b/

export function isLiquid(food: string): boolean {
  return LIQUID.test(food.toLowerCase())
}

/** A stick of butter. */
export const STICK_OF_BUTTER_GRAMS = 113

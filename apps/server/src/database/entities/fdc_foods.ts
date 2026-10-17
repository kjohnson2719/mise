import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import type { NutrientValues, Portion } from "@merran/shared"
import { createdAt } from "./base.ts"

/**
 * A food from USDA FoodData Central, as nutrition uses it: what's in 100 g,
 * and what its household portions weigh. Fetched once, for every household.
 */
export const FdcFood = defineEntity({
  name: "FdcFood",
  tableName: "fdc_foods",
  properties: {
    fdcId: p.integer().primary(),
    description: p.text(),
    /** "Foundation" or "SR Legacy". */
    dataType: p.string(),
    nutrients: p.json<NutrientValues>(),
    portions: p.json<Portion[]>(),
    createdAt: createdAt(),
  },
})
export type FdcFood = InferEntity<typeof FdcFood>

import type { NutrientKey, NutrientValues, Portion } from "@merran/shared"
import { AppError } from "../../core/errors.ts"
import type { Fetcher } from "../fetch/public-fetch.ts"

// USDA FoodData Central, as nutrition uses it: generic foods (Foundation
// and SR Legacy; branded products are noise), what's in 100 g of each, and
// what its household portions weigh. The key goes in a header, so it stays
// out of addresses and logs.

/** A search result: a food the ingredient might be. */
export type FdcCandidate = {
  fdcId: number
  description: string
  /** "Foundation" or "SR Legacy". */
  dataType?: string
}

export type FdcFoodRecord = {
  fdcId: number
  description: string
  dataType: string
  /** Per 100 g. */
  nutrients: NutrientValues
  portions: Portion[]
}

export type FdcClient = {
  /** Generic foods that match, USDA's best first: 8, or `size`. */
  search(query: string, size?: number): Promise<FdcCandidate[]>
  food(fdcId: number): Promise<FdcFoodRecord | null>
}

const BASE = "https://api.nal.usda.gov/fdc/v1"

/** Too many requests this hour (1,000 on a key); a library run waits. */
export const fdcRateLimited = () =>
  new AppError(
    "rate_limited",
    "usda_rate_limited",
    "USDA's limit for the hour is reached. It carries on in a while."
  )

/**
 * FDC nutrient ids for each value, first found wins. Foundation foods give
 * energy by Atwater factors (2047, 2048) and sugars as 1063, rather than
 * SR Legacy's 1008 and 2000.
 */
const NUTRIENT_IDS: Record<NutrientKey, number[]> = {
  calories: [1008, 2047, 2048],
  protein: [1003],
  carbs: [1005],
  fat: [1004],
  fiber: [1079],
  sugar: [2000, 1063],
  sodium: [1093],
}

type RawNutrient = { nutrient?: { id?: number }; amount?: number }
type RawPortion = {
  amount?: number
  gramWeight?: number
  modifier?: string | null
  portionDescription?: string | null
  measureUnit?: { name?: string } | null
}

/** The parts of an FDC food record nutrition uses. */
export function parseFood(raw: {
  fdcId: number
  description: string
  dataType: string
  foodNutrients?: RawNutrient[]
  foodPortions?: RawPortion[]
}): FdcFoodRecord {
  const amounts = new Map<number, number>()
  for (const n of raw.foodNutrients ?? []) {
    if (n.nutrient?.id && typeof n.amount === "number") {
      amounts.set(n.nutrient.id, n.amount)
    }
  }
  const nutrients = Object.fromEntries(
    Object.entries(NUTRIENT_IDS).map(([key, ids]) => [
      key,
      ids.map((id) => amounts.get(id)).find((v) => v !== undefined) ?? null,
    ])
  ) as NutrientValues

  const portions: Portion[] = []
  for (const p of raw.foodPortions ?? []) {
    if (!p.gramWeight || p.gramWeight <= 0) continue
    const unit = p.measureUnit?.name
    const label = [
      unit && unit !== "undetermined" ? unit : null,
      p.modifier,
      p.portionDescription && p.portionDescription !== "Quantity not specified"
        ? p.portionDescription
        : null,
    ]
      .filter(Boolean)
      .join(", ")
    if (!label) continue
    portions.push({ label, amount: p.amount || 1, grams: p.gramWeight })
  }
  return {
    fdcId: raw.fdcId,
    description: raw.description,
    dataType: raw.dataType,
    nutrients,
    portions,
  }
}

export function createFdcClient(fetcher: Fetcher, apiKey: string): FdcClient {
  async function call(path: string, json?: unknown): Promise<unknown> {
    const res = await fetcher(`${BASE}${path}`, {
      accept: "application/json",
      headers: { "x-api-key": apiKey },
      maxBytes: 5_000_000,
      keepErrors: true,
      ...(json === undefined ? {} : { json }),
    })
    if (res.status === 401 || res.status === 403) {
      throw new AppError(
        "unprocessable",
        "usda_key_refused",
        "USDA refused the key. Check it in Settings, This server, Nutrition."
      )
    }
    if (res.status === 429) throw fdcRateLimited()
    if (res.status === 404) return null
    if (res.status >= 400) {
      throw new AppError(
        "upstream",
        "usda_failed",
        "USDA FoodData Central didn't answer. Try again in a bit."
      )
    }
    return JSON.parse(res.body.toString("utf8"))
  }

  return {
    async search(query, size = 8) {
      const body = (await call("/foods/search", {
        query,
        dataType: ["Foundation", "SR Legacy"],
        pageSize: size,
      })) as { foods?: FdcCandidate[] } | null
      return (body?.foods ?? []).map((food) => ({
        fdcId: food.fdcId,
        description: food.description,
        dataType: food.dataType,
      }))
    },
    async food(fdcId) {
      const body = await call(`/food/${fdcId}`)
      return body ? parseFood(body as Parameters<typeof parseFood>[0]) : null
    },
  }
}

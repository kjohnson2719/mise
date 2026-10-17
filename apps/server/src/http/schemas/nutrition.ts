import { z } from "@hono/zod-openapi"
import { JOB_STATUSES } from "../../database/entities/index.ts"
import { IDS, TIMES } from "./examples.ts"

const RUN = {
  id: IDS.nutritionRun,
  status: "running",
  total: 42,
  done: 12,
  workedOut: 11,
  failed: 1,
  stopped: null,
  startedAt: TIMES.now,
  finishedAt: null,
} as const

export const NutritionRunSchema = z
  .object({
    id: z.string(),
    status: z.enum(JOB_STATUSES),
    total: z.number().int(),
    done: z.number().int(),
    workedOut: z.number().int(),
    failed: z.number().int(),
    stopped: z.string().nullable().openapi({
      description: "Why it stopped before the end, when it did.",
    }),
    startedAt: z.iso.datetime().nullable(),
    finishedAt: z.iso.datetime().nullable(),
  })
  .openapi("NutritionRun", { example: RUN })

export const NutritionLibrarySchema = z
  .object({
    missing: z.number().int().openapi({
      description: "Recipes with servings and ingredients but no nutrition.",
    }),
    noServings: z.number().int().openapi({
      description: "Recipes without nutrition that need servings first.",
    }),
    run: NutritionRunSchema.nullable().openapi({
      description: "The latest run, going or finished in the last day.",
    }),
  })
  .openapi("NutritionLibrary", {
    example: { missing: 42, noServings: 3, run: RUN },
  })

export const NutritionRunParam = z.object({
  runId: z.string().openapi({
    param: { name: "runId", in: "path" },
    example: IDS.nutritionRun,
  }),
})

export const UsdaKeyTestSchema = z
  .object({
    usdaKey: z.string().trim().min(10).max(200).optional().openapi({
      description:
        "A key to try before saving it; the saved one when left out.",
    }),
  })
  .openapi("UsdaKeyTest", { example: {} })

export const UsdaKeyTestedSchema = z
  .object({
    found: z
      .string()
      .openapi({ description: "What a search for apples found." }),
  })
  .openapi("UsdaKeyTested", { example: { found: "Apples, raw, with skin" } })

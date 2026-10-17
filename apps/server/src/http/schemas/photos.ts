import { z } from "@hono/zod-openapi"
import { JOB_STATUSES } from "../../database/entities/index.ts"
import { PHOTO_STYLES } from "../../modules/photos/settings.ts"
import { IDS, TIMES } from "./examples.ts"

const RUN = {
  id: IDS.photoRun,
  status: "running",
  total: 30,
  done: 8,
  made: 8,
  failed: 0,
  stopped: null,
  startedAt: TIMES.now,
  finishedAt: null,
} as const

export const PhotoRunSchema = z
  .object({
    id: z.string(),
    status: z.enum(JOB_STATUSES),
    total: z.number().int(),
    done: z.number().int(),
    made: z.number().int(),
    failed: z.number().int(),
    stopped: z.string().nullable().openapi({
      description: "Why it stopped before the end, when it did.",
    }),
    startedAt: z.iso.datetime().nullable(),
    finishedAt: z.iso.datetime().nullable(),
  })
  .openapi("PhotoRun", { example: RUN })

export const PhotoLibrarySchema = z
  .object({
    missing: z.number().int().openapi({
      description: "Recipes without a photo.",
    }),
    ready: z.boolean().openapi({
      description: "Whether AI photos can be made for the household now.",
    }),
    why: z.enum(["off", "noKey"]).nullable().openapi({
      description:
        "Why not: turned off on the server, or no OpenAI or Google key for the household.",
    }),
    style: z.enum(PHOTO_STYLES).openapi({
      description:
        "How the household's photos look; change it at `PATCH /settings/household` (`photos.style`).",
    }),
    run: z.union([PhotoRunSchema, z.null()]).openapi({
      description: "The latest run, going or finished in the last day.",
    }),
  })
  .openapi("PhotoLibrary", {
    example: { missing: 30, ready: true, why: null, style: "marble", run: RUN },
  })

export const PhotoRunParam = z.object({
  runId: z.string().openapi({
    param: { name: "runId", in: "path" },
    example: IDS.photoRun,
  }),
})

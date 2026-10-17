import { z } from "@hono/zod-openapi"
import { JOB_STATUSES } from "../../database/entities/index.ts"
import { JOB } from "./examples.ts"

export const JobSchema = z
  .object({
    id: z.string(),
    kind: z.string().openapi({
      description: 'What it does, like "household.import".',
      example: "household.import",
    }),
    status: z.enum(JOB_STATUSES),
    scheduled: z.boolean().openapi({
      description:
        "Whether it comes round on a schedule, like the nightly purge.",
    }),
    householdId: z.string().nullable(),
    progress: z
      .object({ done: z.number(), total: z.number() })
      .nullable()
      .openapi({ description: "How far it's got, once it says." }),
    result: z.record(z.string(), z.unknown()).nullable().openapi({
      description:
        "What it did, once it's done. A job followed item by item, like importing several links, says what it's done so far as it goes.",
    }),
    error: z
      .string()
      .nullable()
      .openapi({ description: "Why it last failed." }),
    attempts: z.number(),
    maxAttempts: z.number(),
    runAt: z.iso.datetime().openapi({ description: "Not before then." }),
    startedAt: z.iso.datetime().nullable(),
    finishedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
  })
  .openapi("Job", { example: JOB })

const JOB_LIST_ITEM = { ...JOB, householdName: "The Riveras" }

export const JobListItemSchema = JobSchema.extend({
  householdName: z.string().nullable(),
}).openapi("JobListItem", { example: JOB_LIST_ITEM })

export const JobListSchema = z
  .object({ jobs: z.array(JobListItemSchema) })
  .openapi("JobList", { example: { jobs: [JOB_LIST_ITEM] } })

export const JobListQuerySchema = z.object({
  status: z.enum(JOB_STATUSES).optional().openapi({
    description:
      "Only jobs that are queued, running, done, failed or cancelled.",
  }),
})

export const JobParam = z.object({
  jobId: z.string().openapi({ param: { name: "jobId", in: "path" } }),
})

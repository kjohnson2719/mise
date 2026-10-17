import { z } from "@hono/zod-openapi"

export const HealthSchema = z
  .object({
    status: z.literal("ok"),
    version: z.string().openapi({ example: "0.1.0" }),
  })
  .openapi("Health", { example: { status: "ok", version: "0.1.0" } })

export const ReadySchema = z
  .object({
    status: z.literal("ready"),
    database: z.enum(["sqlite", "postgres"]),
  })
  .openapi("Ready", { example: { status: "ready", database: "sqlite" } })

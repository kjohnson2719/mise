import { z } from "@hono/zod-openapi"
import type { ApiKey } from "../../database/entities/index.ts"
import { API_KEY, KEY_PERMISSIONS } from "./examples.ts"

const Access = z.enum(["read", "write"])

/** What a key may do. `household` is only ever read: admin actions need a sign-in. */
export const ApiKeyPermissionsSchema = z
  .object({
    household: z.literal("read").optional(),
    recipes: Access.optional(),
    plan: Access.optional(),
    list: Access.optional(),
    pantry: Access.optional(),
    imports: Access.optional(),
    assistant: Access.optional(),
  })
  .strict()
  .openapi("ApiKeyPermissions", { example: KEY_PERMISSIONS })

export const ApiKeySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    /** The key's first characters, to tell keys apart. */
    start: z.string().openapi({ example: "mrn_3fK9aQ" }),
    household: z.object({ id: z.string(), name: z.string() }),
    permissions: ApiKeyPermissionsSchema,
    expiresAt: z.iso.datetime().nullable(),
    lastUsedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
  })
  .openapi("ApiKey", { example: API_KEY })

export const NewApiKeyRequestSchema = z
  .object({
    name: z.string().trim().min(1, "Give it a name.").max(100),
    permissions: ApiKeyPermissionsSchema,
    household: z.string().optional().openapi({
      description:
        "Which of your households it's for: the one in use when left out.",
    }),
    /** How long it lasts: 30, 90 or 365 days, or null for never. */
    expiresInDays: z
      .union([z.literal(30), z.literal(90), z.literal(365)])
      .nullable()
      .default(90),
  })
  .openapi("NewApiKeyRequest", {
    example: {
      name: "Home Assistant",
      permissions: KEY_PERMISSIONS,
      expiresInDays: 90,
    },
  })

export const NewApiKeySchema = ApiKeySchema.extend({
  /** The key. Shown only now: keep it somewhere safe. */
  key: z.string().openapi({ example: "mrn_3fK9aQ…" }),
}).openapi("NewApiKey", {
  example: { ...API_KEY, lastUsedAt: null, key: "mrn_3fK9aQ…" },
})

export const ApiKeyParam = z.object({
  keyId: z.string().openapi({ param: { name: "keyId", in: "path" } }),
})

/** A key with its household loaded. */
export function describeApiKey(apiKey: ApiKey) {
  const household = apiKey.household.getEntity()
  return {
    id: apiKey.id,
    name: apiKey.name,
    start: apiKey.start,
    household: { id: household.id, name: household.name },
    permissions: apiKey.permissions,
    expiresAt: apiKey.expiresAt?.toISOString() ?? null,
    lastUsedAt: apiKey.lastUsedAt?.toISOString() ?? null,
    createdAt: apiKey.createdAt.toISOString(),
  }
}

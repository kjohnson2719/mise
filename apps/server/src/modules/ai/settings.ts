import {
  AI_TASKS,
  DEFAULT_AI_POLICY,
  KEYED_PROVIDERS,
  parseModelRef,
  SERVER_KEYS_FOR,
  type AiPolicy,
} from "@merran/shared"
// Zod from @hono/zod-openapi, so the API can describe these schemas too.
import { z } from "@hono/zod-openapi"
import { jsonSetting, secretSetting } from "../../core/settings.ts"

/** A model, as "anthropic:claude-opus-5-5" or an address's "endpoint:<id>:<model>". */
export const modelRefSchema = z
  .string()
  .max(300)
  .refine((ref) => parseModelRef(ref) !== null, {
    error: "Pick a model from the list.",
  })

const dollars = z
  .number()
  .min(0, "Use 0 or more.")
  .max(100_000, "That's more than any month could need.")

export const aiPolicySchema: z.ZodType<AiPolicy> = z.object({
  serverKeysFor: z.enum(SERVER_KEYS_FOR),
  households: z.array(z.uuid()).max(1000),
  monthlyLimit: dollars.nullable(),
  limits: z.record(z.uuid(), dollars),
  tasks: z.array(z.enum(AI_TASKS)).max(AI_TASKS.length),
  models: z.array(modelRefSchema).max(100),
  householdKeys: z.boolean(),
  householdAddresses: z.boolean(),
  large: modelRefSchema.nullable(),
  small: modelRefSchema.nullable(),
})

/** What Merran knows of a key from the environment: its credit, and if it ran out. */
export type EnvKeyState = {
  credit: number | null
  creditSince: string | null
  outOfCreditAt: string | null
}

const envKeyStateSchema = z.object({
  credit: z.number().nullable(),
  creditSince: z.string().nullable(),
  outOfCreditAt: z.string().nullable(),
})

/**
 * The server's AI keys can come from the environment, where they can't be
 * changed in the app; others are added in Settings → This server → AI.
 * Who may use them is the policy.
 */
export const AI = {
  anthropicKey: secretSetting({
    key: "ai.anthropicKey",
    env: "MERRAN_ANTHROPIC_API_KEY",
    envOnly: true,
    description:
      "A Claude key for the server, for the households the AI policy covers. Keys can also be added in Settings.",
  }),
  openaiKey: secretSetting({
    key: "ai.openaiKey",
    env: "MERRAN_OPENAI_API_KEY",
    envOnly: true,
    description:
      "An OpenAI key for the server, for the households the AI policy covers. Keys can also be added in Settings.",
  }),
  googleKey: secretSetting({
    key: "ai.googleKey",
    env: "MERRAN_GOOGLE_API_KEY",
    envOnly: true,
    description:
      "A Gemini key for the server, for the households the AI policy covers. Keys can also be added in Settings.",
  }),
  envKeys: jsonSetting({
    key: "ai.envKeys",
    internal: true,
    description:
      "For each AI key set in the environment: the credit entered for it, and when its provider last said it's out.",
    schema: z.partialRecord(
      z.enum(KEYED_PROVIDERS),
      envKeyStateSchema
    ) as z.ZodType<
      Partial<Record<(typeof KEYED_PROVIDERS)[number], EnvKeyState>>
    >,
    default: {},
  }),
  policy: jsonSetting({
    key: "ai.policy",
    internal: true,
    description:
      "Who may use the server's AI keys, and how much: which households, a monthly limit for each, which tasks and models, and whether households may add keys and addresses of their own.",
    schema: aiPolicySchema,
    default: DEFAULT_AI_POLICY,
  }),
}

/** The keys from the environment, by provider. */
export const ENV_KEYS = {
  anthropic: AI.anthropicKey,
  openai: AI.openaiKey,
  google: AI.googleKey,
} as const

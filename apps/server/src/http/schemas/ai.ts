import { z } from "@hono/zod-openapi"
import {
  AI_PROVIDERS,
  AI_TASKS,
  DEFAULT_AI_POLICY,
  KEYED_PROVIDERS,
  SERVER_KEYS_FOR,
} from "@merran/shared"
import { aiPolicySchema, modelRefSchema } from "../../modules/ai/settings.ts"
import { IDS } from "./examples.ts"

// AI: keys and addresses, the server admin's policy, a household's models,
// and what's been spent.

const ModelRefSchema = modelRefSchema.openapi({
  description:
    'A model: "anthropic:claude-opus-5-5", or on an address, "endpoint:<its id>:llama3.1".',
  example: "anthropic:claude-opus-5-5",
})

const KEY = {
  id: IDS.aiKey,
  provider: "anthropic" as const,
  name: null,
  baseUrl: null,
  hint: "7xQa",
  models: ["claude-haiku-5-5", "claude-opus-5-5"],
  testedAt: "2026-10-16T17:00:00.000Z",
  fromEnvironment: false,
  unreadable: false,
  credit: {
    amount: 20,
    since: "2026-10-01T17:00:00.000Z",
    spent: 16.6,
    left: 3.4,
  },
  outOfCreditAt: null,
  lowOnCredit: true,
}

export const AiKeySchema = z
  .object({
    id: z.string().openapi({
      description:
        'Its id; "env:anthropic" and the like for a key set in the server\'s environment.',
    }),
    provider: z.enum(AI_PROVIDERS),
    name: z.string().nullable().openapi({ description: "An address's name." }),
    baseUrl: z
      .string()
      .nullable()
      .openapi({ description: "An OpenAI-compatible address." }),
    hint: z.string().nullable().openapi({
      description:
        "The key's last four characters. The key itself is never sent.",
    }),
    models: z.array(z.string()).nullable().openapi({
      description: "What it can use, from its last test.",
    }),
    testedAt: z.iso.datetime().nullable(),
    fromEnvironment: z.boolean().openapi({
      description:
        "Set in the server's environment, so it can't be changed here.",
    }),
    unreadable: z.boolean().openapi({
      description:
        "Sealed with a master key the server no longer has: take it off and add it again.",
    }),
    credit: z
      .object({
        amount: z
          .number()
          .openapi({ description: "The credit entered, in US dollars." }),
        since: z.iso
          .datetime()
          .openapi({ description: "When it was entered." }),
        spent: z
          .number()
          .openapi({ description: "What Merran has spent on the key since." }),
        left: z.number().openapi({
          description:
            "About what's left. Use of the key outside Merran isn't counted.",
        }),
      })
      .nullable()
      .openapi({
        description:
          "The providers don't tell a key how much credit it has left, so it's what someone entered, less what Merran's spent on it since. None until entered.",
      }),
    outOfCreditAt: z.iso.datetime().nullable().openapi({
      description:
        "When its provider last said it's out of credit. It's passed over for an hour, then tried again; it clears once it works.",
    }),
    lowOnCredit: z.boolean().openapi({
      description: "About a fifth or less of its entered credit left.",
    }),
    creditCheck: z
      .object({
        result: z.enum(["ok", "out", "failed"]),
        message: z.string().nullable(),
      })
      .nullish()
      .openapi({
        description:
          "Only from adding or testing a key: whether one tiny call on its cheapest model found credit (`ok`), none (`out`), or couldn't tell (`failed`, with the provider's words). Addresses aren't checked.",
      }),
  })
  .openapi("AiKey", { example: KEY })

export const KeyCreditSchema = z
  .object({
    amount: z
      .number()
      .min(0, "Use 0 or more.")
      .max(100_000)
      .nullable()
      .openapi({
        description:
          "The credit on the key now, in US dollars; null to stop counting.",
      }),
  })
  .openapi("KeyCredit", { example: { amount: 20 } })

export const KeyParam = z.object({
  keyId: z
    .string()
    .max(64)
    .openapi({ param: { name: "keyId", in: "path" } }),
})

export const NewAiKeySchema = z
  .discriminatedUnion("provider", [
    z.object({
      provider: z.enum(KEYED_PROVIDERS),
      key: z.string().trim().min(10, "That key looks too short.").max(500),
    }),
    z.object({
      provider: z.literal("openai-compatible"),
      name: z.string().trim().min(1, "Name it.").max(60),
      baseUrl: z.string().trim().min(1, "Give its address.").max(500),
      key: z
        .string()
        .trim()
        .max(500)
        .nullish()
        .transform((value) => value || null),
    }),
  ])
  .openapi("NewAiKey", {
    description:
      "A provider's key, or an OpenAI-compatible address (an Ollama, LM Studio, OpenRouter and the like) with a key or none. It's tested before it's kept.",
    example: { provider: "anthropic", key: "sk-ant-api03-...7xQa" },
  })

export const AiPolicySchema = (
  aiPolicySchema as z.ZodType<z.infer<typeof aiPolicySchema>>
).openapi("AiPolicy", {
  description: `Who may use the server's keys: \`serverKeysFor\` is ${SERVER_KEYS_FOR.join(", ")} (the server admins' households, the chosen \`households\`, every household, or none). \`monthlyLimit\` is each household's in US dollars on the server's keys (null for none), and \`limits\` a household's own instead. \`tasks\` and \`models\` are what the server's keys cover (no models means any). \`householdKeys\` and \`householdAddresses\` say whether households may add their own keys and addresses. \`large\` and \`small\` are the models households use when they haven't picked.`,
  example: { ...DEFAULT_AI_POLICY, monthlyLimit: 5 },
})

const ModelOptionSchema = z
  .object({
    ref: ModelRefSchema,
    name: z.string(),
    size: z.enum(["large", "small"]).nullable(),
    price: z.tuple([z.number(), z.number()]).nullable().openapi({
      description:
        "US dollars per million tokens, in and out; null when unknown, or free on an address.",
    }),
    source: z.enum(["server", "household"]).openapi({
      description: "Whose key runs it.",
    }),
  })
  .openapi("AiModelOption")

const cost = z.number().openapi({ description: "In US dollars." })

export const ServerAiSchema = z
  .object({
    keys: z.array(AiKeySchema),
    policy: AiPolicySchema,
    models: z.array(ModelOptionSchema).openapi({
      description: "The models the server's keys can run.",
    }),
    providers: z.array(z.enum(KEYED_PROVIDERS)),
    households: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          covered: z.boolean(),
          serverAdmin: z.boolean().openapi({
            description: "A server admin is in it.",
          }),
          limit: cost.nullable(),
          spent: cost.openapi({
            description: "This month, on the server's keys.",
          }),
          near: z.boolean(),
        })
      )
      .openapi({
        description: "Every household, and its spend on the server's keys.",
      }),
    usage: z.object({
      months: z.array(z.object({ month: z.string(), cost, calls: z.number() })),
      models: z.array(
        z.object({
          provider: z.enum(AI_PROVIDERS),
          model: z.string(),
          cost,
          calls: z.number(),
        })
      ),
    }),
  })
  .openapi("ServerAi", {
    example: {
      keys: [KEY],
      policy: DEFAULT_AI_POLICY,
      models: [
        {
          ref: "anthropic:claude-opus-5-5",
          name: "Claude Opus 5.5",
          size: "large",
          price: [4, 20],
          source: "server",
        },
      ],
      providers: [...KEYED_PROVIDERS],
      households: [
        {
          id: IDS.household,
          name: "The Johnsons",
          covered: true,
          serverAdmin: true,
          limit: null,
          spent: 1.24,
          near: false,
        },
      ],
      usage: {
        months: [{ month: "2026-10", cost: 1.24, calls: 31 }],
        models: [
          {
            provider: "anthropic",
            model: "claude-opus-5-5",
            cost: 1.24,
            calls: 31,
          },
        ],
      },
    },
  })

const taskStatus = z.union([
  z.object({
    ok: z.literal(true),
    ref: z.string(),
    source: z.enum(["server", "household"]),
  }),
  z.object({
    ok: z.literal(false),
    why: z.enum(["noKey", "notCovered", "overLimit", "ownLimit"]),
  }),
])

export const HouseholdAiSettingsSchema = z
  .object({
    large: ModelRefSchema.nullable(),
    small: ModelRefSchema.nullable(),
    tasks: z.partialRecord(z.enum(AI_TASKS), ModelRefSchema).openapi({
      description: "A model for a task of its own.",
    }),
    monthlyLimit: z.number().min(0).max(100_000).nullable().openapi({
      description:
        "A monthly limit on its own keys, in US dollars; null for none.",
    }),
    autoTidy: z.boolean().default(false).openapi({
      description:
        "Tidy up each recipe it imports, in the background, with the suggestions left in the Review queue.",
    }),
  })
  .openapi("HouseholdAiSettings", {
    example: {
      large: null,
      small: null,
      tasks: {},
      monthlyLimit: 10,
      autoTidy: false,
    },
  })

export const HouseholdAiSchema = z
  .object({
    status: z.object({
      available: z.boolean(),
      tasks: z.record(z.enum(AI_TASKS), taskStatus).openapi({
        description: "For each task, the model and whose key, or why none.",
      }),
      month: z.string(),
      server: z.object({
        covers: z.boolean(),
        hasKeys: z.boolean(),
        limit: cost.nullable(),
        spent: cost,
        near: z.boolean(),
      }),
      own: z.object({ limit: cost.nullable(), spent: cost, near: z.boolean() }),
      mayAddKeys: z.boolean(),
      mayAddAddresses: z.boolean(),
      keyAlerts: z
        .array(
          z.object({
            id: z.string(),
            source: z.enum(["server", "household"]),
            provider: z.enum(AI_PROVIDERS),
            name: z.string().nullable(),
            outOfCredit: z.boolean(),
            left: z.number().nullable().openapi({
              description: "About what's left, when credit was entered.",
            }),
          })
        )
        .openapi({
          description:
            "The keys it relies on, its own and the server's, that are out of credit or running low.",
        }),
    }),
    keys: z.array(AiKeySchema),
    settings: HouseholdAiSettingsSchema,
    models: z.array(ModelOptionSchema),
    usage: z.object({
      months: z.array(
        z.object({
          month: z.string(),
          server: cost,
          household: cost,
          calls: z.number(),
        })
      ),
      tasks: z.array(z.object({ task: z.string(), cost, calls: z.number() })),
      people: z.array(
        z.object({
          userId: z.string().nullable(),
          name: z.string().nullable(),
          cost,
          calls: z.number(),
        })
      ),
    }),
  })
  .openapi("HouseholdAi", {
    example: {
      status: {
        available: true,
        tasks: Object.fromEntries(
          AI_TASKS.map((task) => [
            task,
            {
              ok: true as const,
              ref: "anthropic:claude-opus-5-5",
              source: "server" as const,
            },
          ])
        ) as never,
        month: "2026-10",
        server: {
          covers: true,
          hasKeys: true,
          limit: 5,
          spent: 1.24,
          near: false,
        },
        own: { limit: null, spent: 0, near: false },
        mayAddKeys: true,
        mayAddAddresses: false,
        keyAlerts: [],
      },
      keys: [],
      settings: { large: null, small: null, tasks: {}, monthlyLimit: null },
      models: [],
      usage: {
        months: [{ month: "2026-10", server: 1.24, household: 0, calls: 31 }],
        tasks: [{ task: "import", cost: 1.24, calls: 31 }],
        people: [{ userId: IDS.sam, name: "Sam", cost: 1.24, calls: 31 }],
      },
    },
  })

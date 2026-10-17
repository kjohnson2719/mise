// The AI providers Merran talks to, the tasks it uses them for, and the
// models it knows: what each can do and what it costs. Models on an
// address of the household's or the server's own (Ollama and the like)
// aren't listed here: they're whatever that address says it has, free.

export const AI_PROVIDERS = [
  "anthropic",
  "openai",
  "google",
  "openai-compatible",
] as const
export type AiProvider = (typeof AI_PROVIDERS)[number]

/** The providers with a key of their own, rather than an address. */
export const KEYED_PROVIDERS = ["anthropic", "openai", "google"] as const
export type KeyedProvider = (typeof KEYED_PROVIDERS)[number]

/** What Merran uses AI for. Each can have its own model. */
export const AI_TASKS = [
  "assistant",
  "import",
  "tidy",
  "notes",
  "swaps",
  "nutrition",
  "shopping",
  "receipts",
  "discover",
  "reminders",
] as const
export type AiTask = (typeof AI_TASKS)[number]

export type ModelSize = "large" | "small"

/**
 * The size of model each task needs: a large one to read a recipe page or
 * hold a conversation, a small cheap one to match "onion" to "Onions, raw".
 */
export const TASK_SIZES: Record<AiTask, ModelSize> = {
  assistant: "large",
  import: "large",
  tidy: "large",
  notes: "large",
  swaps: "small",
  nutrition: "small",
  shopping: "small",
  receipts: "small",
  discover: "small",
  reminders: "small",
}

/** What a model can do, which a feature checks before it runs. */
export type ModelAbility =
  "tools" | "images" | "pdfs" | "structured" | "webSearch"

export type CatalogModel = {
  provider: KeyedProvider
  id: string
  name: string
  size: ModelSize
  abilities: readonly ModelAbility[]
  /** US dollars per million tokens, in and out; null when unknown. */
  price: readonly [input: number, output: number] | null
}

const ALL: readonly ModelAbility[] = [
  "tools",
  "images",
  "pdfs",
  "structured",
  "webSearch",
]

/**
 * The models Merran knows, with list prices checked October 16, 2026.
 * Gemini 4 Argon's introductory price doubles on December 1, 2026, and
 * Gemini 3.8 Flash's on January 1, 2027.
 */
export const AI_MODELS: readonly CatalogModel[] = [
  {
    provider: "anthropic",
    id: "claude-fable-5-1",
    name: "Claude Fable 5.1",
    size: "large",
    abilities: ALL,
    price: [10, 50],
  },
  {
    provider: "anthropic",
    id: "claude-opus-5-5",
    name: "Claude Opus 5.5",
    size: "large",
    abilities: ALL,
    price: [4, 20],
  },
  {
    provider: "anthropic",
    id: "claude-sonnet-5-5",
    name: "Claude Sonnet 5.5",
    size: "large",
    abilities: ALL,
    price: [2, 10],
  },
  {
    provider: "anthropic",
    id: "claude-haiku-5-5",
    name: "Claude Haiku 5.5",
    size: "small",
    abilities: ALL,
    price: [0.1, 0.5],
  },
  {
    provider: "openai",
    id: "gpt-6-astra",
    name: "GPT-6 Astra",
    size: "large",
    abilities: ALL,
    price: [10, 50],
  },
  {
    provider: "openai",
    id: "gpt-6-sol",
    name: "GPT-6 Sol",
    size: "large",
    abilities: ALL,
    price: [2, 10],
  },
  {
    provider: "openai",
    id: "gpt-6.1-sol",
    name: "GPT-6.1 Sol",
    size: "large",
    abilities: ALL,
    price: [2, 10],
  },
  {
    provider: "openai",
    id: "gpt-6-luna",
    name: "GPT-6 Luna",
    size: "small",
    abilities: ALL,
    price: [0.1, 0.5],
  },
  {
    provider: "google",
    id: "gemini-4-argon",
    name: "Gemini 4 Argon",
    size: "large",
    abilities: ALL,
    price: [2, 10],
  },
  {
    provider: "google",
    id: "gemini-3.8-flash",
    name: "Gemini 3.8 Flash",
    size: "small",
    abilities: ALL,
    price: [0.75, 3.75],
  },
  {
    provider: "google",
    id: "gemini-3.5-flash-lite",
    name: "Gemini 3.5 Flash-Lite",
    size: "small",
    abilities: ["tools", "images", "pdfs", "structured"],
    price: [0.3, 2.5],
  },
]

/**
 * The model each provider uses for each size when nobody's picked one:
 * the one suggested, the right size and no bigger. Reading a recipe page
 * or a photo, tidying one up or holding a conversation is well within
 * Sonnet's reach, at half Opus's price; matching "onion" to "Onions, raw"
 * is Haiku's.
 */
export const DEFAULT_MODELS: Record<
  KeyedProvider,
  Record<ModelSize, string>
> = {
  anthropic: { large: "claude-sonnet-5-5", small: "claude-haiku-5-5" },
  openai: { large: "gpt-6-sol", small: "gpt-6-luna" },
  google: { large: "gemini-4-argon", small: "gemini-3.8-flash" },
}

/** The model suggested for a task on a provider: its size's default. */
export const suggestedModel = (provider: KeyedProvider, task: AiTask) =>
  DEFAULT_MODELS[provider][TASK_SIZES[task]]

/**
 * Roughly what a task takes each time, in tokens: a recipe page read, a
 * message answered. For saying what a model would cost for it, "about 3¢
 * a recipe", so a model that's more than a task needs shows.
 */
export const TASK_USE: Record<AiTask, { input: number; output: number }> = {
  assistant: { input: 5_000, output: 600 },
  import: { input: 8_000, output: 1_500 },
  tidy: { input: 3_000, output: 2_500 },
  notes: { input: 2_500, output: 800 },
  swaps: { input: 800, output: 200 },
  nutrition: { input: 1_200, output: 300 },
  shopping: { input: 1_500, output: 200 },
  receipts: { input: 2_000, output: 600 },
  discover: { input: 1_500, output: 400 },
  reminders: { input: 1_500, output: 200 },
}

/** About what one use of a task costs on a price, in US dollars. */
export const costPerUse = (price: readonly number[], task: AiTask) =>
  ((price[0] ?? 0) * TASK_USE[task].input +
    (price[1] ?? 0) * TASK_USE[task].output) /
  1_000_000

export const PROVIDER_NAMES: Record<AiProvider, string> = {
  anthropic: "Claude",
  openai: "OpenAI",
  google: "Gemini",
  "openai-compatible": "Your own address",
}

export function catalogModel(provider: string, id: string) {
  return AI_MODELS.find(
    (model) => model.provider === provider && model.id === id
  )
}

/** What a call cost, in US dollars, or null for a model with no known price. */
export function costOf(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number
) {
  // An address of one's own costs nothing per token.
  if (provider === "openai-compatible") return 0
  const price = catalogModel(provider, model)?.price
  if (!price) return null
  return (inputTokens * price[0] + outputTokens * price[1]) / 1_000_000
}

/**
 * Which model, written as one string: "anthropic:claude-opus-5-5", or for
 * an address of one's own, "endpoint:<its id>:llama3.1:8b" (model names
 * there can have colons in them).
 */
export type ModelRef = string

export type ParsedModelRef =
  | { kind: "keyed"; provider: KeyedProvider; model: string }
  | { kind: "endpoint"; endpoint: string; model: string }

export function parseModelRef(ref: string): ParsedModelRef | null {
  const at = ref.indexOf(":")
  if (at <= 0 || at === ref.length - 1) return null
  const first = ref.slice(0, at)
  const rest = ref.slice(at + 1)
  if (first === "endpoint") {
    const next = rest.indexOf(":")
    if (next <= 0 || next === rest.length - 1) return null
    return {
      kind: "endpoint",
      endpoint: rest.slice(0, next),
      model: rest.slice(next + 1),
    }
  }
  if (!(KEYED_PROVIDERS as readonly string[]).includes(first)) return null
  return { kind: "keyed", provider: first as KeyedProvider, model: rest }
}

export const modelRef = (provider: KeyedProvider, model: string): ModelRef =>
  `${provider}:${model}`

export const endpointRef = (endpoint: string, model: string): ModelRef =>
  `endpoint:${endpoint}:${model}`

/** The month spend counts towards: "2026-10", by the household's own days. */
export const monthOf = (day: string) => day.slice(0, 7)

import { APICallError } from "ai"
import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test"
import type { AiModels, AiTarget } from "../services/ai/providers.ts"
import type { FetchOptions, Fetcher } from "../services/fetch/public-fetch.ts"

// AI providers for tests, which never spend money: model lists that accept
// the keys below and no others, and models that answer "ok" having taken
// so many tokens.

export const GOOD_KEYS = {
  anthropic: "sk-ant-api03-test-key-AbCd",
  openai: "sk-proj-test-key-EfGh",
  google: "AIzaSy-test-key-IjKl",
}

/** The addresses tests use: one on a home network, one public. */
export const ADDRESSES = {
  home: "http://192.168.1.20:11434/v1",
  public: "https://llm.example.com/v1",
}

/** What each provider's model list answers, and the header its key comes in. */
const LISTS: Record<
  string,
  { header: string | null; key: string | null; body: unknown }
> = {
  "https://api.anthropic.com/v1/models?limit=1000": {
    header: "x-api-key",
    key: GOOD_KEYS.anthropic,
    body: { data: [{ id: "claude-opus-5-5" }, { id: "claude-haiku-5-5" }] },
  },
  "https://api.openai.com/v1/models": {
    header: "authorization",
    key: `Bearer ${GOOD_KEYS.openai}`,
    body: { data: [{ id: "gpt-6-sol" }, { id: "gpt-6-luna" }] },
  },
  "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000": {
    header: "x-goog-api-key",
    key: GOOD_KEYS.google,
    body: { models: [{ name: "models/gemini-4-argon" }] },
  },
  [`${ADDRESSES.home}/models`]: {
    header: null,
    key: null,
    body: { data: [{ id: "llama3.1:8b" }, { id: "qwen3" }] },
  },
  [`${ADDRESSES.public}/models`]: {
    header: null,
    key: null,
    body: { data: [{ id: "mixtral" }] },
  },
}

/** Every request the fake fetcher was asked for, for tests to look at. */
export type FetchCall = { url: string; options: FetchOptions }

/** A fetcher that answers like the AI providers, and nothing else. */
export function fakeAiFetcher(calls: FetchCall[] = []): Fetcher {
  return async (url, options = {}) => {
    calls.push({ url, options })
    const list = LISTS[url]
    if (!list) throw new Error(`Tests don't reach ${url}`)
    const accepted = !list.header || options.headers?.[list.header] === list.key
    return {
      url,
      status: accepted ? 200 : 401,
      contentType: "application/json",
      body: Buffer.from(
        JSON.stringify(accepted ? list.body : { error: "invalid key" })
      ),
    }
  }
}

/** What Anthropic answers a key with no credit. */
const NO_CREDIT = JSON.stringify({
  type: "error",
  error: {
    type: "invalid_request_error",
    message:
      "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.",
  },
})

/** What a mock model is asked: the prompt, and the form of answer wanted. */
export type MockCall = { prompt: unknown; responseFormat?: unknown }

/** What a mock model answers: text, or text and tools to call. */
export type MockReply =
  string | { text?: string; toolCalls?: { toolName: string; input: unknown }[] }

/**
 * Models that answer "ok", or what `reply` says, taking `tokens`, and
 * remember where calls went. Calls to a provider in `outOfCredit` are
 * refused as a key with no credit.
 */
export function mockAiModels(
  tokens = { input: 10_000, output: 1_000 },
  targets: AiTarget[] = [],
  outOfCredit: Set<string> = new Set(),
  reply: (call: MockCall) => MockReply = () => "ok"
): AiModels {
  return (target) => {
    targets.push(target)
    const refuse = () => {
      if (!outOfCredit.has(target.provider)) return
      throw new APICallError({
        message: "Your credit balance is too low to access the Anthropic API.",
        url: "https://api.anthropic.com/v1/messages",
        requestBodyValues: {},
        statusCode: 400,
        responseBody: NO_CREDIT,
        isRetryable: false,
      })
    }
    const usage = {
      inputTokens: {
        total: tokens.input,
        noCache: tokens.input,
        cacheRead: 0,
        cacheWrite: 0,
      },
      outputTokens: { total: tokens.output, text: tokens.output, reasoning: 0 },
    }
    /** A reply as text and tool calls, each call with its own id. */
    const answer = (call: MockCall) => {
      const replied = reply(call)
      const { text, toolCalls = [] } =
        typeof replied === "string" ? { text: replied } : replied
      return {
        text,
        toolCalls: toolCalls.map((toolCall, i) => ({
          type: "tool-call" as const,
          toolCallId: `call-${++calls}-${i}`,
          toolName: toolCall.toolName,
          input: JSON.stringify(toolCall.input),
        })),
      }
    }
    return new MockLanguageModelV4({
      provider: target.provider,
      modelId: target.model,
      doGenerate: async (call) => {
        refuse()
        const { text, toolCalls } = answer(call)
        return {
          content: [
            ...(text ? [{ type: "text" as const, text }] : []),
            ...toolCalls,
          ],
          finishReason: toolCalls.length
            ? { unified: "tool-calls", raw: "tool_use" }
            : { unified: "stop", raw: "stop" },
          usage,
          warnings: [],
        }
      },
      doStream: async (call) => {
        refuse()
        const { text, toolCalls } = answer(call)
        return {
          stream: convertArrayToReadableStream([
            { type: "stream-start", warnings: [] },
            ...(text
              ? [
                  { type: "text-start" as const, id: "text" },
                  { type: "text-delta" as const, id: "text", delta: text },
                  { type: "text-end" as const, id: "text" },
                ]
              : []),
            ...toolCalls,
            {
              type: "finish",
              finishReason: toolCalls.length
                ? { unified: "tool-calls", raw: "tool_use" }
                : { unified: "stop", raw: "stop" },
              usage,
            },
          ]),
        }
      },
    })
  }
}

/** Tool calls made so far, for their ids. */
let calls = 0

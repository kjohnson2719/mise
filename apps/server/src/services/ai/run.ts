import {
  catalogModel,
  PROVIDER_NAMES,
  type AiProvider,
  type AiTask,
  type ModelAbility,
  type Unavailable,
} from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import {
  APICallError,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  RetryError,
  type LanguageModel,
  type LanguageModelUsage,
  type ToolSet,
} from "ai"
import type { AppDeps } from "../../core/context.ts"
import { AppError } from "../../core/errors.ts"
import {
  clearOutOfCredit,
  isOutOfCredit,
  markOutOfCredit,
  outOfCreditError,
} from "./credit.ts"
import { targetOf } from "./keys.ts"
import { webSearchTools, type AiTarget } from "./providers.ts"
import { resolveTask } from "./status.ts"
import { recordUsage } from "./usage.ts"

// The one way a feature calls AI: whose key pays is worked out, the limits
// are checked against a rough estimate first, and what the call took and
// cost is recorded after, against the household, the person, the task and
// the key. A key its provider says is out of credit is noted, and the call
// goes to the next key there is.

/** What calling AI takes: settings for whose key pays, and the models. */
export type AiDeps = Pick<AppDeps, "settings" | "fetcher" | "ai">

/** Why a feature can't use AI, said so someone can fix it. */
const UNAVAILABLE: Record<
  Unavailable,
  { kind: "forbidden" | "rate_limited"; message: string }
> = {
  noKey: {
    kind: "forbidden",
    message:
      "There's no AI key for this. A household admin can add one in Settings, Household, AI.",
  },
  notCovered: {
    kind: "forbidden",
    message:
      "The server's AI keys don't cover this. A household admin can add a key of the household's own in Settings, Household, AI.",
  },
  overLimit: {
    kind: "rate_limited",
    message:
      "This month's AI on the server's keys is used up. It's back next month, or a household admin can add a key of the household's own.",
  },
  ownLimit: {
    kind: "rate_limited",
    message:
      "This month's limit on the household's own AI keys is reached. A household admin can raise it in Settings, Household, AI.",
  },
}

export function aiUnavailable(why: Unavailable) {
  const { kind, message } = UNAVAILABLE[why]
  return new AppError(kind, `ai_${why}`, message)
}

/** What a model that can't do something can't do, in words. */
const ABILITY_WORDS: Record<ModelAbility, string> = {
  images: "read photos",
  pdfs: "read PDFs",
  structured: "fill in a form",
  tools: "use tools",
  webSearch: "search the web",
}

/** Who answered, in words: "Claude", or "The AI at your address". */
const whoAnswered = (provider: AiProvider) =>
  provider === "openai-compatible"
    ? "The AI at your address"
    : PROVIDER_NAMES[provider]

/**
 * A call that failed, said plainly: the provider's error, or an answer
 * that wasn't what was asked for. Anything else is Merran's own, and stays
 * as it is.
 */
function callFailed(error: unknown, provider: AiProvider) {
  const cause = RetryError.isInstance(error) ? error.lastError : error
  const who = whoAnswered(provider)
  if (
    NoObjectGeneratedError.isInstance(cause) ||
    NoOutputGeneratedError.isInstance(cause)
  ) {
    return new AppError(
      "upstream",
      "ai_answer_unreadable",
      `${who}'s answer couldn't be read. Try again, or pick another model in Settings, Household, AI.`
    )
  }
  if (APICallError.isInstance(cause)) {
    if (cause.statusCode === 429) {
      return new AppError(
        "rate_limited",
        "ai_busy",
        `${who} is busy, or the key's reached its provider's rate limit. Try again in a minute.`
      )
    }
    if (cause.statusCode === undefined) {
      return new AppError(
        "upstream",
        "ai_unreachable",
        `${who} couldn't be reached. Try again in a moment.`
      )
    }
    return new AppError(
      "upstream",
      "ai_failed",
      `${who} answered with an error (${cause.statusCode}). Try again in a moment.`
    )
  }
  return error
}

/** What a call can use besides the model. */
export type AiExtras = {
  target: AiTarget
  /** The provider's web search, when the model can search; else none. */
  webSearch: ToolSet | null
}

function extrasFor(target: AiTarget, model: string): AiExtras {
  const known = catalogModel(target.provider, model)
  return {
    target,
    webSearch: known?.abilities.includes("webSearch")
      ? webSearchTools(target)
      : null,
  }
}

/**
 * A model for a household's task that streams, like the assistant: whose
 * key pays is worked out and the limits checked first, as `useAi` does,
 * and `finished` records what the stream took when it's done. A key out
 * of credit is noted by `failed`, for the next message to go elsewhere.
 */
export async function prepareAi(
  deps: AiDeps,
  em: EntityManager,
  options: {
    householdId: string
    userId: string | null
    task: AiTask
    needs?: readonly ModelAbility[]
  }
) {
  const resolution = await resolveTask(
    deps,
    em,
    options.householdId,
    options.task
  )
  if (!resolution.ok) throw aiUnavailable(resolution.why)
  const { key, model } = resolution
  const known = catalogModel(key.provider, model)
  const cant = options.needs?.find(
    (ability) => known && !known.abilities.includes(ability)
  )
  if (known && cant) {
    throw new AppError(
      "unprocessable",
      "ai_model_cant",
      `${known.name} can't ${ABILITY_WORDS[cant]}. Pick a model that can in Settings, Household, AI.`
    )
  }
  const target = await targetOf(deps, em, key.id, model)
  return {
    model: deps.ai(target),
    ...extrasFor(target, model),
    async finished(usage: LanguageModelUsage) {
      await clearOutOfCredit(deps, em, key.id)
      await recordUsage(em, {
        householdId: options.householdId,
        userId: options.userId,
        task: options.task,
        provider: key.provider,
        model,
        source: key.source,
        keyId: key.id,
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
      })
    },
    async failed(error: unknown) {
      if (isOutOfCredit(error)) await markOutOfCredit(deps, em, key.id)
      return callFailed(error, key.provider)
    },
    /** What went wrong, in words to show. */
    explain(error: unknown) {
      const failure = callFailed(error, key.provider)
      return failure instanceof AppError
        ? failure.message
        : "Something went wrong. Try again in a moment."
    },
  }
}

/**
 * Runs an AI call for a household's task. `call` gets the model to use and
 * returns what AI SDK did, its usage included.
 */
export async function useAi<T extends { usage: LanguageModelUsage }>(
  deps: AiDeps,
  em: EntityManager,
  options: {
    householdId: string
    /** Who asked; none for background work. */
    userId: string | null
    task: AiTask
    /** A rough cost, in US dollars, checked against the limits first. */
    estimate?: number
    /**
     * What the model must be able to do, like read photos. Checked for the
     * models Merran knows; an address's are tried as they are.
     */
    needs?: readonly ModelAbility[]
  },
  call: (model: LanguageModel, extras: AiExtras) => Promise<T>
): Promise<T> {
  // A key that turns out to be out of credit is noted, and the next tried:
  // a few at most.
  const outOfCredit: string[] = []
  for (let tries = 0; tries < 5; tries++) {
    const resolution = await resolveTask(
      deps,
      em,
      options.householdId,
      options.task,
      options.estimate
    )
    if (!resolution.ok) {
      if (outOfCredit.length > 0) throw outOfCreditError(outOfCredit[0]!)
      throw aiUnavailable(resolution.why)
    }
    const { key, model } = resolution
    const known = catalogModel(key.provider, model)
    const cant = options.needs?.find(
      (ability) => known && !known.abilities.includes(ability)
    )
    if (known && cant) {
      throw new AppError(
        "unprocessable",
        "ai_model_cant",
        `${known.name} can't ${ABILITY_WORDS[cant]}. Pick a model that can in Settings, Household, AI.`
      )
    }
    const target = await targetOf(deps, em, key.id, model)
    let result: T
    try {
      result = await call(deps.ai(target), extrasFor(target, model))
    } catch (error) {
      if (!isOutOfCredit(error)) throw callFailed(error, key.provider)
      await markOutOfCredit(deps, em, key.id)
      outOfCredit.push(PROVIDER_NAMES[key.provider])
      continue
    }
    await clearOutOfCredit(deps, em, key.id)
    await recordUsage(em, {
      householdId: options.householdId,
      userId: options.userId,
      task: options.task,
      provider: key.provider,
      model,
      source: key.source,
      keyId: key.id,
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
    })
    return result
  }
  throw outOfCreditError(outOfCredit[0] ?? "The provider")
}

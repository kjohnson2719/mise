import { AI_MODELS, KEYED_PROVIDERS, type KeyedProvider } from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { APICallError, generateText, RetryError } from "ai"
import type { AppDeps } from "../../core/context.ts"
import { AppError } from "../../core/errors.ts"
import { AiKey, AiUsage } from "../../database/entities/index.ts"
import { HOUSEHOLD_FILTER } from "../../database/scope.ts"
import { AI, type EnvKeyState } from "../../modules/ai/settings.ts"
import type { AiTarget } from "./providers.ts"

// A key's credit. The providers don't tell a key how much it has left, but
// they do say plainly when it's run out, so that's noted on the key, and
// it's passed over for an hour before it's tried again. How much is left
// is an estimate: the credit someone entered for the key, less what Merran
// has spent on it since.

type Deps = Pick<AppDeps, "settings">

/** Warned about at a fifth of its credit left. */
const LOW_SHARE = 0.2

/** A key out of credit is passed over this long, then tried again. */
const PASS_OVER_MS = 60 * 60 * 1000

/** How the providers say it: Anthropic, OpenAI, OpenRouter, Gemini's prepay. */
const OUT_OF_CREDIT =
  /credit balance is too low|insufficient_quota|exceeded your current quota|insufficient credits|prepayment credits are depleted/i

/** Whether an error from an AI call means its key is out of credit. */
export function isOutOfCredit(error: unknown) {
  const errors = RetryError.isInstance(error) ? error.errors : [error]
  return errors.some(
    (one) =>
      APICallError.isInstance(one) &&
      (one.statusCode === 402 ||
        OUT_OF_CREDIT.test(`${one.message} ${one.responseBody ?? ""}`))
  )
}

const envProvider = (keyId: string) =>
  KEYED_PROVIDERS.find((provider) => keyId === `env:${provider}`)

/** What's known of a key's credit, wherever it's kept. */
export type KeyState = {
  credit: number | null
  creditSince: Date | null
  outOfCreditAt: Date | null
}

async function envStates(deps: Deps) {
  return await deps.settings.server(AI.envKeys)
}

export async function stateOf(
  deps: Deps,
  em: EntityManager,
  keyId: string
): Promise<KeyState> {
  const env = envProvider(keyId)
  if (env) {
    const state = (await envStates(deps))[env]
    return {
      credit: state?.credit ?? null,
      creditSince: state?.creditSince ? new Date(state.creditSince) : null,
      outOfCreditAt: state?.outOfCreditAt
        ? new Date(state.outOfCreditAt)
        : null,
    }
  }
  const row = await em.findOne(AiKey, { id: keyId })
  return {
    credit: row?.credit == null ? null : Number(row.credit),
    creditSince: row?.creditSince ?? null,
    outOfCreditAt: row?.outOfCreditAt ?? null,
  }
}

async function saveState(
  deps: Deps,
  em: EntityManager,
  keyId: string,
  change: Partial<KeyState>
) {
  const env = envProvider(keyId)
  if (env) {
    const all = await envStates(deps)
    const was: EnvKeyState = all[env] ?? {
      credit: null,
      creditSince: null,
      outOfCreditAt: null,
    }
    const iso = (date: Date | null | undefined, old: string | null) =>
      date === undefined ? old : (date?.toISOString() ?? null)
    await deps.settings.keepServer(em, AI.envKeys, {
      ...all,
      [env]: {
        credit: change.credit === undefined ? was.credit : change.credit,
        creditSince: iso(change.creditSince, was.creditSince),
        outOfCreditAt: iso(change.outOfCreditAt, was.outOfCreditAt),
      },
    })
    return
  }
  const row = await em.findOne(AiKey, { id: keyId })
  if (!row) return
  Object.assign(row, change)
  await em.flush()
}

/** Notes that the provider says a key is out of credit. */
export const markOutOfCredit = (deps: Deps, em: EntityManager, keyId: string) =>
  saveState(deps, em, keyId, { outOfCreditAt: new Date() })

/** It worked: whatever was noted about running out is past. */
export async function clearOutOfCredit(
  deps: Deps,
  em: EntityManager,
  keyId: string
) {
  if ((await stateOf(deps, em, keyId)).outOfCreditAt) {
    await saveState(deps, em, keyId, { outOfCreditAt: null })
  }
}

/** Out of credit lately enough that it isn't worth trying the key again yet. */
export const passedOver = (state: KeyState) =>
  state.outOfCreditAt !== null &&
  Date.now() - state.outOfCreditAt.getTime() < PASS_OVER_MS

/** What a key's spent since its credit was entered. */
async function spentSince(em: EntityManager, keyId: string, since: Date) {
  const rows = await em.find(
    AiUsage,
    { key: keyId, createdAt: { $gte: since } },
    { fields: ["cost"], filters: { [HOUSEHOLD_FILTER]: false } }
  )
  return rows.reduce((total, row) => total + Number(row.cost ?? 0), 0)
}

/** A key's credit as Settings shows it: entered, spent since, and about what's left. */
export async function creditView(
  em: EntityManager,
  keyId: string,
  state: KeyState
) {
  const credit =
    state.credit !== null && state.creditSince
      ? await (async () => {
          const spent = await spentSince(em, keyId, state.creditSince!)
          return {
            amount: state.credit!,
            since: state.creditSince!.toISOString(),
            spent,
            left: Math.max(0, state.credit! - spent),
          }
        })()
      : null
  return {
    credit,
    outOfCredit: state.outOfCreditAt !== null,
    lowOnCredit:
      credit !== null &&
      state.outOfCreditAt === null &&
      credit.left <= credit.amount * LOW_SHARE,
  }
}

/**
 * Notes the credit on a key now, from what its provider's dashboard says,
 * or none to stop counting. Topped up, it's tried again straight away.
 */
export async function setCredit(
  deps: Deps,
  em: EntityManager,
  keyId: string,
  amount: number | null
) {
  await saveState(deps, em, keyId, {
    credit: amount,
    creditSince: amount === null ? null : new Date(),
    outOfCreditAt: null,
  })
}

/**
 * Whether a key has credit, by the cheapest model it has making one tiny
 * call: a sliver of a cent. Notes what it finds; anything else that goes
 * wrong says nothing either way.
 */
export async function checkCredit(
  deps: Deps & Pick<AppDeps, "ai">,
  em: EntityManager,
  keyId: string,
  target: Omit<AiTarget, "model">,
  models: readonly string[]
): Promise<CreditCheck | null> {
  if (target.provider === "openai-compatible") return null
  const provider = target.provider as KeyedProvider
  const cheapest = AI_MODELS.filter(
    (model) =>
      model.provider === provider && model.price && models.includes(model.id)
  ).sort((a, b) => a.price![0] + a.price![1] - (b.price![0] + b.price![1]))[0]
  if (!cheapest) {
    return {
      result: "failed",
      message: "None of the models Merran knows are on this key.",
    }
  }
  try {
    await generateText({
      model: deps.ai({ ...target, model: cheapest.id }),
      prompt: "Reply with OK.",
      maxOutputTokens: 16,
      maxRetries: 0,
    })
    await clearOutOfCredit(deps, em, keyId)
    return { result: "ok", message: null }
  } catch (error) {
    if (isOutOfCredit(error)) {
      await markOutOfCredit(deps, em, keyId)
      return { result: "out", message: null }
    }
    // Something else: the provider's own words, briefly.
    const message = (error as Error)?.message ?? String(error)
    return { result: "failed", message: message.slice(0, 200) }
  }
}

/** What a credit check found: credit, none, or that it couldn't tell. */
export type CreditCheck = {
  result: "ok" | "out" | "failed"
  message: string | null
}

/** A key out of credit, with no other to use: said so someone can fix it. */
export const outOfCreditError = (name: string) =>
  new AppError(
    "upstream",
    "ai_out_of_credit",
    `${name} says this key is out of credit, and there's no other AI key to use. Top it up with the provider, then test it in Settings.`
  )

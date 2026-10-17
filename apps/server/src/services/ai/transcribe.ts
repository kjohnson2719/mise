import type { EntityManager } from "@mikro-orm/sql"
import type { AppDeps } from "../../core/context.ts"
import { targetOf } from "./keys.ts"
import { TRANSCRIPTION_MODEL, TRANSCRIPTION_PER_MINUTE } from "./providers.ts"
import { canTranscribe } from "./status.ts"
import { recordUsage } from "./usage.ts"

type Deps = Pick<AppDeps, "settings" | "fetcher" | "transcribe">

// Speech to text, for a video without captions: on an OpenAI key, from
// whoever pays for the household's importing. It counts towards their AI
// spend like any other call.

/** Whether a household can have speech turned into text. */
export async function transcriptionFor(
  deps: Deps,
  em: EntityManager,
  householdId: string
) {
  return canTranscribe(deps, em, householdId)
}

/**
 * The words in a video's sound, or null when nobody's key can do it. A
 * failure is noted and treated as none: the caption may be enough.
 */
export async function transcribeFor(
  deps: Deps,
  em: EntityManager,
  options: {
    householdId: string
    userId: string | null
    audio: Buffer
    /** The video's length, for the cost when the provider doesn't say. */
    seconds: number | null
  }
) {
  const key = await canTranscribe(deps, em, options.householdId)
  if (!key) return null
  const target = await targetOf(deps, em, key.id, TRANSCRIPTION_MODEL)
  const transcript = await deps.transcribe(target, options.audio)
  const seconds = transcript.seconds ?? options.seconds ?? 0
  await recordUsage(em, {
    householdId: options.householdId,
    userId: options.userId,
    task: "import",
    provider: "openai",
    model: TRANSCRIPTION_MODEL,
    source: key.source,
    keyId: key.id,
    inputTokens: 0,
    outputTokens: 0,
    cost: (seconds / 60) * TRANSCRIPTION_PER_MINUTE,
  })
  await em.flush()
  return transcript.text.trim() || null
}

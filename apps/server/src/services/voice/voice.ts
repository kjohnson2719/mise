import { createHash } from "node:crypto"
import type { EntityManager } from "@mikro-orm/sql"
import type { AppDeps } from "../../core/context.ts"
import { AppError } from "../../core/errors.ts"
import { VOICE, type VoiceProvider } from "../../modules/voice/settings.ts"
import { targetOf } from "../ai/keys.ts"
import { SPEECH_MODEL, SPEECH_PER_CHARACTER } from "../ai/media.ts"
import { keyFrom } from "../ai/status.ts"
import { recordUsage } from "../ai/usage.ts"
import type { Settings } from "../settings/settings.ts"

// The server voice: cook steps read aloud by Kokoro (beside Merran, free)
// or OpenAI, the same on every device. Each piece of text is read once per
// voice and kept, so a step is never paid for twice; the device's own
// voice reads when this can't.

export type VoiceDeps = Pick<
  AppDeps,
  "settings" | "fetcher" | "media" | "files"
>

export const DEFAULT_VOICES = { kokoro: "af_heart", openai: "marin" } as const

/** OpenAI's voices for gpt-4o-mini-tts, best first. */
export const OPENAI_VOICES = [
  "marin",
  "cedar",
  "coral",
  "sage",
  "ash",
  "ballad",
  "verse",
  "alloy",
  "echo",
  "fable",
  "nova",
  "onyx",
  "shimmer",
] as const

/** The longest text read in one go: a long step. */
export const MOST_CHARACTERS = 2000

/** A step to read when trying a voice. */
export const SAMPLE =
  "Bring a large pot of salted water to the boil, then add the pasta and stir. Cook for ten minutes, until it's just tender."

/** Who reads, in which voice, and where Kokoro is. */
export async function chosenVoice(settings: Settings) {
  const [provider, kokoroUrl, kokoroVoice, openaiVoice] = await Promise.all([
    settings.server(VOICE.provider),
    settings.server(VOICE.kokoroUrl),
    settings.server(VOICE.kokoroVoice),
    settings.server(VOICE.openaiVoice),
  ])
  return {
    // Unset: Kokoro when Merran knows where it is.
    provider: provider ?? (kokoroUrl ? "kokoro" : "device"),
    kokoroUrl: kokoroUrl?.replace(/\/+$/, "") ?? null,
    voices: {
      kokoro: kokoroVoice ?? DEFAULT_VOICES.kokoro,
      openai: openaiVoice ?? DEFAULT_VOICES.openai,
    },
  } as {
    provider: VoiceProvider
    kokoroUrl: string | null
    voices: { kokoro: string; openai: string }
  }
}

const unavailable = (message: string) =>
  new AppError("unprocessable", "voice_unavailable", message)

/** Where a reading is kept: by provider, voice and the words. */
function readingKey(provider: string, voice: string, text: string) {
  const hash = createHash("sha256")
    .update(`${provider}\n${voice}\n${text}`)
    .digest("hex")
  return `voice/${provider}/${voice.toLowerCase()}/${hash}.mp3`
}

/** Some text read by Kokoro, at the address the server admin gave. */
async function kokoroReads(
  deps: VoiceDeps,
  url: string,
  voice: string,
  text: string
) {
  try {
    const answer = await deps.fetcher(`${url}/v1/audio/speech`, {
      homeNetwork: true,
      accept: "audio/mpeg",
      maxBytes: 20_000_000,
      json: {
        model: "kokoro",
        input: text,
        voice,
        response_format: "mp3",
      },
    })
    if (!answer.body.length) throw new Error("No sound")
    return answer.body
  } catch {
    throw unavailable("Kokoro didn't answer. Is it running at that address?")
  }
}

/**
 * Text read aloud in the server's voice, as MP3: kept from before, or
 * read now. For OpenAI, on an OpenAI key from whoever pays for the
 * household's assistant, counted in its AI spend.
 */
export async function speak(
  deps: VoiceDeps,
  em: EntityManager,
  options: {
    householdId: string
    userId: string | null
    text: string
    /** Another voice than the chosen one, to try it. */
    trying?: {
      provider: Exclude<VoiceProvider, "device">
      voice: string
      kokoroUrl?: string | null
    }
  }
) {
  const text = options.text
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MOST_CHARACTERS)
  if (!text) throw new AppError("invalid", "no_text", "Say what to read.")
  const chosen = await chosenVoice(deps.settings)
  const provider = options.trying?.provider ?? chosen.provider
  if (provider === "device") {
    throw unavailable("The server voice is off: each device reads in its own.")
  }
  const voice = options.trying?.voice ?? chosen.voices[provider]
  const key = readingKey(provider, voice, text)
  const kept = await deps.files.read(key)
  if (kept) return kept

  let sound: Buffer
  if (provider === "kokoro") {
    const url =
      options.trying?.kokoroUrl?.replace(/\/+$/, "") ?? chosen.kokoroUrl
    if (!url) throw unavailable("Kokoro's address isn't set.")
    sound = await kokoroReads(deps, url, voice, text)
  } else {
    const paying = await keyFrom(deps, em, {
      householdId: options.householdId,
      task: "assistant",
      providers: ["openai"],
      estimate: text.length * SPEECH_PER_CHARACTER,
    })
    if (!paying) {
      throw unavailable(
        "The server voice needs an OpenAI key for this household, so this device reads in its own."
      )
    }
    const target = await targetOf(deps, em, paying.id, SPEECH_MODEL)
    try {
      sound = await deps.media.speech(target, text, voice)
    } catch (err) {
      if (err instanceof AppError) throw err
      throw unavailable("OpenAI's voice didn't answer.")
    }
    await recordUsage(em, {
      householdId: options.householdId,
      userId: options.userId,
      task: "assistant",
      provider: "openai",
      model: SPEECH_MODEL,
      source: paying.source,
      keyId: paying.id,
      inputTokens: 0,
      outputTokens: 0,
      cost: text.length * SPEECH_PER_CHARACTER,
    })
    await em.flush()
  }
  await deps.files.put(key, sound)
  return sound
}

/**
 * Whether the server reads aloud for a household: Kokoro at an address, or
 * OpenAI on one of its keys. Otherwise its devices read in their own voice.
 */
export async function voiceFor(
  deps: VoiceDeps,
  em: EntityManager,
  householdId: string
) {
  const chosen = await chosenVoice(deps.settings)
  const on =
    chosen.provider === "kokoro"
      ? Boolean(chosen.kokoroUrl)
      : chosen.provider === "openai"
        ? Boolean(
            await keyFrom(deps, em, {
              householdId,
              task: "assistant",
              providers: ["openai"],
            })
          )
        : false
  return { provider: chosen.provider, on }
}

/** What a Kokoro voice's name says: "af_heart" is Heart, an American woman. */
export function describeKokoroVoice(id: string) {
  const [prefix = "", ...rest] = id.split("_")
  const accents: Record<string, string> = {
    a: "American",
    b: "British",
    e: "Spanish",
    f: "French",
    h: "Hindi",
    i: "Italian",
    j: "Japanese",
    p: "Brazilian Portuguese",
    z: "Mandarin",
  }
  const name = rest.join(" ")
  return {
    id,
    name: name ? name[0]!.toUpperCase() + name.slice(1) : id,
    accent: accents[prefix[0] ?? ""] ?? null,
    gender: prefix[1] === "f" ? "woman" : prefix[1] === "m" ? "man" : null,
    english: prefix[0] === "a" || prefix[0] === "b",
  } as {
    id: string
    name: string
    accent: string | null
    gender: "woman" | "man" | null
    english: boolean
  }
}

/** The voices Kokoro has, English first; or why it couldn't say. */
export async function kokoroVoices(deps: VoiceDeps, url: string) {
  try {
    const answer = await deps.fetcher(
      `${url.replace(/\/+$/, "")}/v1/audio/voices`,
      { homeNetwork: true, accept: "application/json", maxBytes: 1_000_000 }
    )
    const body = JSON.parse(answer.body.toString("utf8")) as {
      voices?: unknown
    }
    const ids = (Array.isArray(body.voices) ? body.voices : [])
      .map((voice) =>
        typeof voice === "string"
          ? voice
          : ((voice as { id?: unknown; name?: unknown })?.id ??
            (voice as { name?: unknown })?.name)
      )
      .filter(
        (voice): voice is string =>
          typeof voice === "string" && /^[a-z0-9_-]{1,40}$/i.test(voice)
      )
    const voices = ids.map(describeKokoroVoice)
    return {
      voices: [
        ...voices.filter((voice) => voice.english),
        ...voices.filter((voice) => !voice.english),
      ],
      error: null,
    }
  } catch {
    return {
      voices: [],
      error: "Kokoro didn't answer at that address.",
    }
  }
}

/** The server voice as Settings, This server shows it. */
export async function voiceSettings(deps: VoiceDeps) {
  const chosen = await chosenVoice(deps.settings)
  const kokoro = chosen.kokoroUrl
    ? await kokoroVoices(deps, chosen.kokoroUrl)
    : { voices: [], error: null }
  return {
    provider: chosen.provider,
    kokoroUrl: chosen.kokoroUrl,
    voices: chosen.voices,
    kokoro,
    openai: OPENAI_VOICES.map((id) => ({
      id,
      name: id[0]!.toUpperCase() + id.slice(1),
    })),
  }
}

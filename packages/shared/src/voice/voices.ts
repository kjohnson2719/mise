/** What a browser says about one of its voices (SpeechSynthesisVoice). */
export type VoiceInfo = { name: string; lang: string; default: boolean }

/** Words in a voice's name that mark the natural-sounding ones. */
const NATURAL = /\b(natural|neural|premium|enhanced|siri)\b/i
/** Good, if a step behind: Google's, and other voices streamed online. */
const GOOD = /\b(google|online)\b/i
/** Apple's joke and very old voices, never picked by themselves. */
const NOVELTY =
  /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|deranged|hysterical|junior|ralph|fred|kathy|princess|grandma|grandpa|rocko|shelley|eddy|flo|reed|sandy)\b/i

const base = (lang: string) => lang.toLowerCase().split(/[-_]/)[0]!

/**
 * How good a voice is for reading in a language: -1 for another language,
 * 0 for a joke voice, then higher for natural ones and an exact match.
 */
export function voiceScore(voice: VoiceInfo, lang: string) {
  if (base(voice.lang) !== base(lang)) return -1
  if (NOVELTY.test(voice.name)) return 0
  let score = 1
  if (voice.lang.toLowerCase().replace("_", "-") === lang.toLowerCase()) {
    score += 2
  }
  if (NATURAL.test(voice.name)) score += 10
  else if (GOOD.test(voice.name)) score += 5
  if (voice.default) score += 1
  return score
}

/** The voices worth choosing from for a language, best first. */
export function goodVoices<T extends VoiceInfo>(
  voices: readonly T[],
  lang: string,
  limit = 8
) {
  return voices
    .map((voice) => ({ voice, score: voiceScore(voice, lang) }))
    .filter((entry) => entry.score > 0)
    .sort(
      (a, b) => b.score - a.score || a.voice.name.localeCompare(b.voice.name)
    )
    .slice(0, limit)
    .map((entry) => entry.voice)
}

/** "Microsoft Aria Online (Natural) - English (United States)" → "Aria Online (Natural)". */
export function voiceLabel(voice: Pick<VoiceInfo, "name">) {
  return voice.name
    .replace(/\s+-\s+.*$/, "")
    .replace(/^(Microsoft|Google)\s+/, "")
    .trim()
}

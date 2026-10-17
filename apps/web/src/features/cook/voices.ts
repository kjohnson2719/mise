import { goodVoices } from "@merran/shared"
import * as React from "react"

import i18n from "@/i18n"

const VOICE_KEY = "merran-cook-voice"
const listeners = new Set<() => void>()

/** The voice chosen on this device: a voice's id, or "auto" for the best one. */
function readChoice() {
  try {
    return localStorage.getItem(VOICE_KEY) ?? "auto"
  } catch {
    return "auto"
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The voice choice, kept on this device. */
export function useVoiceChoice() {
  const choice = React.useSyncExternalStore(subscribe, readChoice, () => "auto")
  const setChoice = React.useCallback((next: string) => {
    try {
      localStorage.setItem(VOICE_KEY, next)
    } catch {
      // It still changes, just isn't remembered.
    }
    for (const listener of listeners) listener()
  }, [])
  return [choice, setChoice] as const
}

/** The device's voices, which some browsers only list a moment after loading. */
export function useVoices() {
  const [voices, setVoices] = React.useState<SpeechSynthesisVoice[]>(() =>
    "speechSynthesis" in window ? window.speechSynthesis.getVoices() : []
  )
  React.useEffect(() => {
    if (!("speechSynthesis" in window)) return
    const update = () => setVoices(window.speechSynthesis.getVoices())
    window.speechSynthesis.addEventListener("voiceschanged", update)
    return () =>
      window.speechSynthesis.removeEventListener("voiceschanged", update)
  }, [])
  return voices
}

/**
 * The language to read and listen in: Merran's, with the device's region
 * when it's the same language ("en-GB" on a British phone).
 */
export function readingLanguage() {
  const app = i18n.language || "en"
  const device = navigator.language || ""
  const base = (language: string) => language.toLowerCase().split(/[-_]/)[0]
  return base(device) === base(app) ? device : app
}

/** The voice to read with right now: the one chosen, else the best there is. */
export function chosenVoice(
  voices: SpeechSynthesisVoice[] = "speechSynthesis" in window
    ? window.speechSynthesis.getVoices()
    : [],
  choice = readChoice()
) {
  const picked =
    choice === "auto" ? undefined : voices.find((v) => v.voiceURI === choice)
  return picked ?? goodVoices(voices, readingLanguage(), 1)[0] ?? null
}

/** A sentence in a voice, to hear what it sounds like. */
export function testVoice(choice?: string) {
  if (!("speechSynthesis" in window)) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(i18n.t("cook.voice.sample"))
  const voice = chosenVoice(undefined, choice)
  if (voice) utterance.voice = voice
  utterance.lang = voice?.lang ?? readingLanguage()
  window.speechSynthesis.speak(utterance)
}

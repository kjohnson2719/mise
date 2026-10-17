import { forSpeech, parseCookCommand, type CookCommand } from "@merran/shared"
import * as React from "react"

import {
  readAhead,
  serverReading,
  SILENCE,
  useServerVoice,
} from "./server-voice"
import { chosenVoice, readingLanguage } from "./voices"

// The Web Speech API isn't in TypeScript's DOM types everywhere, so just
// what's used here.
type RecognitionResult = { isFinal: boolean; 0: { transcript: string } }
type Recognition = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: { results: ArrayLike<RecognitionResult> }) => void) | null
  onstart: (() => void) | null
  onend: (() => void) | null
  onerror: ((event: { error: string }) => void) | null
  start(): void
  abort(): void
}
type RecognitionClass = new () => Recognition

function recognitionClass(): RecognitionClass | null {
  if (typeof window === "undefined") return null
  const speech = window as unknown as {
    SpeechRecognition?: RecognitionClass
    webkitSpeechRecognition?: RecognitionClass
  }
  return speech.SpeechRecognition ?? speech.webkitSpeechRecognition ?? null
}

/** Whether this browser can listen and speak. Chrome, Edge and Safari can; Firefox can't listen. */
export function handsFreeSupported() {
  return Boolean(recognitionClass()) && "speechSynthesis" in window
}

/**
 * Listens for cooking commands while on, and reads things aloud: in the
 * server's voice when it reads for the household, else (or when it's slow
 * or fails) in the device's. Listening pauses while it speaks, so it
 * doesn't hear itself, and starts again whenever the browser stops it
 * (after a silence, say).
 */
export function useHandsFree({
  enabled,
  onCommand,
  onDenied,
}: {
  enabled: boolean
  onCommand: (command: CookCommand) => void
  /** The microphone was refused. */
  onDenied: () => void
}) {
  const [listening, setListening] = React.useState(false)
  const [heard, setHeard] = React.useState<string | null>(null)
  const recognition = React.useRef<Recognition | null>(null)
  const speaking = React.useRef(false)
  const enabledRef = React.useRef(enabled)
  const handlers = React.useRef({ onCommand, onDenied })
  React.useEffect(() => {
    enabledRef.current = enabled
    handlers.current = { onCommand, onDenied }
  })
  /** Each thing said takes a turn; a newer one cuts off the older. */
  const turn = React.useRef(0)
  const serverOn = useServerVoice()
  /** One player for the server's readings, let play by the first tap. */
  const player = React.useRef<HTMLAudioElement | null>(null)

  /** Stops anything being read aloud, by either voice. */
  const hush = React.useCallback(() => {
    window.speechSynthesis?.cancel()
    const playing = player.current
    if (playing) {
      playing.onended = null
      playing.onerror = null
      playing.pause()
    }
  }, [])

  const listen = React.useCallback(() => {
    try {
      recognition.current?.start()
    } catch {
      // Already listening.
    }
  }, [])

  React.useEffect(() => {
    if (!enabled) return
    const Recognizer = recognitionClass()
    if (!Recognizer) return
    const language = readingLanguage()
    const recognizer = new Recognizer()
    recognizer.continuous = true
    recognizer.interimResults = false
    recognizer.lang = language
    recognizer.onresult = (event) => {
      const result = event.results[event.results.length - 1]
      if (!result?.isFinal) return
      const said = result[0].transcript.trim()
      setHeard(said)
      const command = parseCookCommand(said, language)
      if (command) handlers.current.onCommand(command)
    }
    recognizer.onstart = () => setListening(true)
    recognizer.onend = () => {
      setListening(false)
      // Browsers stop listening after a while; carry on unless speaking.
      if (
        enabledRef.current &&
        !speaking.current &&
        recognition.current === recognizer
      ) {
        listen()
      }
    }
    recognizer.onerror = (event) => {
      if (
        event.error === "not-allowed" ||
        event.error === "service-not-allowed"
      ) {
        handlers.current.onDenied()
      }
    }
    recognition.current = recognizer
    if (!speaking.current) listen()
    return () => {
      recognition.current = null
      recognizer.onend = null
      try {
        recognizer.abort()
      } catch {
        // Already stopped.
      }
      hush()
      setListening(false)
      setHeard(null)
    }
  }, [enabled, listen, hush])

  /** Reads text aloud, not listening meanwhile. */
  const speak = React.useCallback(
    (text: string) => {
      if (!text.trim()) return
      const language = readingLanguage()
      const spoken = forSpeech(text, language)
      const mine = ++turn.current
      hush()
      // Played from the tap that turns hands-free on, so phones let the
      // server's readings play later on.
      if (serverOn && !player.current) {
        player.current = new Audio(SILENCE)
        void player.current.play().catch(() => {})
      }
      speaking.current = true
      try {
        recognition.current?.abort()
      } catch {
        // Not listening.
      }

      let done = false
      let fallback: ReturnType<typeof setTimeout> | undefined
      const finished = () => {
        if (done) return
        done = true
        clearTimeout(fallback)
        // Something newer is being said; it carries on from here.
        if (turn.current !== mine) return
        speaking.current = false
        if (enabledRef.current) listen()
      }
      /** In the device's own voice. */
      const deviceReads = () => {
        if (turn.current !== mine) return
        if (!("speechSynthesis" in window)) return finished()
        // Some browsers never say they've finished (no voices installed,
        // say): listen again after about as long as it takes to read.
        clearTimeout(fallback)
        fallback = setTimeout(
          finished,
          Math.min(60_000, 1500 + spoken.length * 90)
        )
        const utterance = new SpeechSynthesisUtterance(spoken)
        const voice = chosenVoice()
        if (voice) utterance.voice = voice
        utterance.lang = voice?.lang ?? language
        utterance.onend = finished
        utterance.onerror = finished
        window.speechSynthesis.speak(utterance)
      }
      if (!serverOn) return deviceReads()

      void serverReading(spoken).then((url) => {
        if (turn.current !== mine) return
        const audio = player.current
        if (!url || !audio) return deviceReads()
        fallback = setTimeout(
          finished,
          Math.min(120_000, 3000 + spoken.length * 120)
        )
        audio.onended = finished
        audio.onerror = deviceReads
        audio.src = url
        void audio.play().catch(deviceReads)
      })
    },
    [listen, hush, serverOn]
  )

  /** Gets the server's reading of what's next ready, while this is read. */
  const prepare = React.useCallback(
    (text: string) => {
      if (serverOn && text.trim()) {
        readAhead(forSpeech(text, readingLanguage()))
      }
    },
    [serverOn]
  )

  /** Stops reading aloud, and listens again if hands-free is still on. */
  const stopSpeaking = React.useCallback(() => {
    turn.current++
    hush()
    speaking.current = false
    if (enabledRef.current) listen()
  }, [listen, hush])

  return { listening, heard, speak, prepare, stopSpeaking }
}

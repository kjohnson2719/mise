import { chosenVoice } from "../../services/voice/voice.ts"
import type { Module } from "../module.ts"
import { VOICE } from "./settings.ts"

/**
 * The server voice: cook steps read aloud by Kokoro, beside Merran, or by
 * OpenAI, the same on every device. Off, each device reads in its own
 * voice, which always works.
 */
export const voice: Module = {
  id: "voice",
  settings: Object.values(VOICE),
  capabilities: ["voice"],

  async status({ settings }) {
    const chosen = await chosenVoice(settings)
    if (chosen.provider === "device") return { on: false, needs: "off" }
    if (chosen.provider === "kokoro" && !chosen.kokoroUrl) {
      return { on: false, needs: "kokoroUrl" }
    }
    return { on: true }
  },

  async client({ settings }) {
    const chosen = await chosenVoice(settings)
    return { provider: chosen.provider }
  },
}

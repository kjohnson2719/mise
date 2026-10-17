import { z } from "zod"
import { choiceSetting, textSetting } from "../../core/settings.ts"

/** Who reads cook steps aloud: each device's own voice, Kokoro, or OpenAI. */
export const VOICE_PROVIDERS = ["device", "kokoro", "openai"] as const
export type VoiceProvider = (typeof VOICE_PROVIDERS)[number]

const VoiceName = z
  .string()
  .trim()
  .regex(/^[a-z0-9_-]{1,40}$/i, "Use a voice's name, like af_heart")

export const VOICE = {
  provider: choiceSetting({
    key: "voice.provider",
    env: "MERRAN_VOICE",
    choices: VOICE_PROVIDERS,
    description:
      "Who reads cook steps aloud: each device's own voice, Kokoro beside Merran (free, the same on every device), or OpenAI (about 1.5¢ a minute of reading, on a household's OpenAI key). Unset, it's Kokoro when Merran has Kokoro's address, else the device's.",
  }),
  kokoroUrl: textSetting({
    key: "voice.kokoroUrl",
    env: "MERRAN_KOKORO_URL",
    description:
      "Where Kokoro answers, like http://kokoro:8880. It may be on the home network.",
    schema: z
      .string()
      .trim()
      .url("Use Kokoro's full address, starting with http://")
      .max(500),
  }),
  kokoroVoice: textSetting({
    key: "voice.kokoroVoice",
    env: "MERRAN_KOKORO_VOICE",
    description: "Kokoro's voice: af_heart unless another is picked.",
    schema: VoiceName,
  }),
  openaiVoice: textSetting({
    key: "voice.openaiVoice",
    env: "MERRAN_OPENAI_VOICE",
    description: "OpenAI's voice: marin unless another is picked.",
    schema: VoiceName,
  }),
}

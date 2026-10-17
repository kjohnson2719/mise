import { z } from "@hono/zod-openapi"
import { VOICE_PROVIDERS } from "../../modules/voice/settings.ts"
import { MOST_CHARACTERS } from "../../services/voice/voice.ts"

export const HouseholdVoiceSchema = z
  .object({
    provider: z.enum(VOICE_PROVIDERS).openapi({
      description: "Who the server admin picked to read aloud.",
    }),
    on: z.boolean().openapi({
      description:
        "Whether the server reads aloud for this household: false means each device reads in its own voice.",
    }),
  })
  .openapi("HouseholdVoice", { example: { provider: "kokoro", on: true } })

export const SpeakSchema = z
  .object({
    text: z
      .string()
      .trim()
      .min(1, "Say what to read.")
      .max(MOST_CHARACTERS * 2, "That's too long to read in one go."),
  })
  .openapi("Speak", {
    example: { text: "Bring a large pot of salted water to the boil." },
  })

export const MP3_RESPONSE = {
  description: "The reading, as MP3.",
  content: {
    "audio/mpeg": { schema: z.string().openapi({ format: "binary" }) },
  },
}

const KOKORO_VOICE = {
  id: "af_heart",
  name: "Heart",
  accent: "American",
  gender: "woman" as const,
  english: true,
}

export const VoiceSettingsSchema = z
  .object({
    provider: z.enum(VOICE_PROVIDERS),
    kokoroUrl: z.string().nullable(),
    voices: z
      .object({ kokoro: z.string(), openai: z.string() })
      .openapi({ description: "The voice picked for each." }),
    kokoro: z.object({
      voices: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          accent: z.string().nullable(),
          gender: z.enum(["woman", "man"]).nullable(),
          english: z.boolean(),
        })
      ),
      error: z.string().nullable().openapi({
        description: "Why Kokoro couldn't say which voices it has.",
      }),
    }),
    openai: z.array(z.object({ id: z.string(), name: z.string() })),
  })
  .openapi("VoiceSettings", {
    example: {
      provider: "kokoro",
      kokoroUrl: "http://kokoro:8880",
      voices: { kokoro: "af_heart", openai: "marin" },
      kokoro: { voices: [KOKORO_VOICE], error: null },
      openai: [{ id: "marin", name: "Marin" }],
    },
  })

export const VoicePreviewSchema = z
  .object({
    provider: z.enum(["kokoro", "openai"]),
    voice: z
      .string()
      .trim()
      .regex(/^[a-z0-9_-]{1,40}$/i, "Use a voice's name, like af_heart"),
    kokoroUrl: z.string().trim().url().max(500).optional().openapi({
      description: "Kokoro's address, to try one before saving it.",
    }),
  })
  .openapi("VoicePreview", {
    example: { provider: "kokoro", voice: "bf_emma" },
  })

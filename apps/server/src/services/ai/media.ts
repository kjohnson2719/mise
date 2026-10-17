import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import {
  experimental_generateSpeech as generateSpeech,
  generateImage,
} from "ai"
import { AppError } from "../../core/errors.ts"
import type { AiTarget } from "./providers.ts"

// Pictures and speech from AI providers, for recipe photos and the server
// voice. Tests pass fakes, so they never reach a provider.

/** Makes pictures and speech. Tests pass fakes. */
export type MediaMakers = {
  /** A landscape picture for a prompt, as PNG, JPEG or WebP bytes. */
  image(target: AiTarget, prompt: string): Promise<Buffer>
  /** Some text read aloud in a voice, as MP3. */
  speech(target: AiTarget, text: string, voice: string): Promise<Buffer>
}

/** The picture models Merran uses, and about what one photo costs, in US dollars. */
export const IMAGE_MODELS = {
  openai: { model: "gpt-image-1-mini", perImage: 0.015 },
  google: { model: "gemini-2.5-flash-image", perImage: 0.039 },
} as const

/** Providers that can make pictures. */
export type ImageProvider = keyof typeof IMAGE_MODELS

export const canMakeImages = (provider: string): provider is ImageProvider =>
  provider in IMAGE_MODELS

/** OpenAI's speech model, and about what it costs per character read. */
export const SPEECH_MODEL = "gpt-4o-mini-tts"
/** About $0.015 a minute, and a minute is about 900 characters. */
export const SPEECH_PER_CHARACTER = 0.015 / 900

/** How the server voice reads: warm and clear, like someone at the counter. */
const READING =
  "Read this recipe step warmly and clearly, at an easy pace, like a friend reading it aloud in the kitchen."

const cant = () =>
  new AppError(
    "unprocessable",
    "ai_model_cant",
    "That AI key can't make pictures. OpenAI and Google keys can."
  )

export function createMediaMakers(): MediaMakers {
  return {
    async image(target, prompt) {
      const apiKey = target.apiKey ?? undefined
      if (target.provider === "openai") {
        const { image } = await generateImage({
          model: createOpenAI({ apiKey }).image(target.model),
          prompt,
          size: "1536x1024",
          providerOptions: { openai: { quality: "medium" } },
        })
        return Buffer.from(image.uint8Array)
      }
      if (target.provider === "google") {
        const { image } = await generateImage({
          model: createGoogleGenerativeAI({ apiKey }).image(target.model),
          prompt,
          aspectRatio: "3:2",
        })
        return Buffer.from(image.uint8Array)
      }
      throw cant()
    },

    async speech(target, text, voice) {
      if (target.provider !== "openai") {
        throw new AppError(
          "unprocessable",
          "ai_model_cant",
          "Only OpenAI keys can read aloud."
        )
      }
      const { audio } = await generateSpeech({
        model: createOpenAI({ apiKey: target.apiKey ?? undefined }).speech(
          target.model
        ),
        text,
        voice,
        outputFormat: "mp3",
        instructions: READING,
      })
      return Buffer.from(audio.uint8Array)
    },
  }
}

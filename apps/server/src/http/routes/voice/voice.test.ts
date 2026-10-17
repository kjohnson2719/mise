import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../app.ts"
import type { MediaMakers } from "../../../services/ai/media.ts"
import type { AiTarget } from "../../../services/ai/providers.ts"
import type {
  FetchOptions,
  Fetcher,
} from "../../../services/fetch/public-fetch.ts"
import { fakeAiFetcher, GOOD_KEYS, mockAiModels } from "../../../test/ai.ts"
import { createTestApp, setUpServer, TestClient } from "../../../test/app.ts"

const KOKORO = "http://kokoro.test:8880"
const SOUND = Buffer.from("ID3 a recipe step, read aloud")

/** What Kokoro was asked to read. */
const kokoroAsked: { voice: string; input: string }[] = []
/** What OpenAI was asked to read. */
const openaiAsked: { target: AiTarget; text: string; voice: string }[] = []

const aiFetcher = fakeAiFetcher()
const fetcher: Fetcher = async (url, options: FetchOptions = {}) => {
  if (url === `${KOKORO}/v1/audio/voices`) {
    return {
      url,
      status: 200,
      contentType: "application/json",
      body: Buffer.from(
        JSON.stringify({ voices: ["jf_alpha", "af_heart", "bm_george"] })
      ),
    }
  }
  if (url === `${KOKORO}/v1/audio/speech`) {
    kokoroAsked.push(options.json as { voice: string; input: string })
    return { url, status: 200, contentType: "audio/mpeg", body: SOUND }
  }
  return aiFetcher(url, options)
}

const media: MediaMakers = {
  image: () => Promise.reject(new Error("Not in these tests.")),
  speech: async (target, text, voice) => {
    openaiAsked.push({ target, text, voice })
    return SOUND
  },
}

let app: App
let close: () => Promise<void>
let kyle: TestClient

beforeAll(async () => {
  const test = await createTestApp({ fetcher, ai: mockAiModels(), media })
  ;({ app, close } = test)
  kyle = await setUpServer(app, test.setupCode)
})

afterAll(() => close())

const say = (text: string) => kyle.post("/api/voice/speak", { text })

describe("the server voice", () => {
  test("is off to start with: each device reads in its own", async () => {
    expect(await (await kyle.get("/api/voice")).json()).toEqual({
      provider: "device",
      on: false,
    })
    const res = await say("Chop the onion.")
    expect(res.status).toBe(422)
    const { capabilities } = await (await kyle.get("/api/capabilities")).json()
    expect(capabilities).not.toContain("voice")
  })

  test("is Kokoro once Merran knows where it is, and reads each text once", async () => {
    const saved = await kyle.patch("/api/settings/server", {
      "voice.kokoroUrl": `${KOKORO}/`,
    })
    expect(saved.status, await saved.clone().text()).toBe(200)
    expect(await (await kyle.get("/api/voice")).json()).toEqual({
      provider: "kokoro",
      on: true,
    })

    const first = await say("  Chop the   onion. ")
    expect(first.status).toBe(200)
    expect(first.headers.get("content-type")).toBe("audio/mpeg")
    expect(Buffer.from(await first.arrayBuffer())).toEqual(SOUND)
    expect(kokoroAsked).toEqual([
      expect.objectContaining({ voice: "af_heart", input: "Chop the onion." }),
    ])

    // Kept: the same words aren't read again.
    expect((await say("Chop the onion.")).status).toBe(200)
    expect(kokoroAsked).toHaveLength(1)
  })

  test("lists Kokoro's voices, English first, to try before picking", async () => {
    const settings = await (await kyle.get("/api/settings/server/voice")).json()
    expect(settings).toMatchObject({
      provider: "kokoro",
      kokoroUrl: KOKORO,
      voices: { kokoro: "af_heart", openai: "marin" },
      kokoro: { error: null },
    })
    expect(settings.kokoro.voices).toEqual([
      {
        id: "af_heart",
        name: "Heart",
        accent: "American",
        gender: "woman",
        english: true,
      },
      {
        id: "bm_george",
        name: "George",
        accent: "British",
        gender: "man",
        english: true,
      },
      {
        id: "jf_alpha",
        name: "Alpha",
        accent: "Japanese",
        gender: "woman",
        english: false,
      },
    ])

    const preview = await kyle.post("/api/settings/server/voice/preview", {
      provider: "kokoro",
      voice: "bm_george",
    })
    expect(preview.status).toBe(200)
    expect(kokoroAsked.at(-1)).toMatchObject({ voice: "bm_george" })
  })

  test("is OpenAI's on a household's OpenAI key, when picked", async () => {
    await kyle.patch("/api/settings/server", { "voice.provider": "openai" })
    // No OpenAI key yet: the device reads.
    expect(await (await kyle.get("/api/voice")).json()).toEqual({
      provider: "openai",
      on: false,
    })
    expect((await say("Stir in the rice.")).status).toBe(422)

    const key = await kyle.post("/api/settings/server/ai/keys", {
      provider: "openai",
      key: GOOD_KEYS.openai,
    })
    expect(key.status, await key.clone().text()).toBe(201)
    expect((await (await kyle.get("/api/voice")).json()).on).toBe(true)

    expect((await say("Stir in the rice.")).status).toBe(200)
    expect(openaiAsked).toEqual([
      expect.objectContaining({
        target: expect.objectContaining({
          provider: "openai",
          model: "gpt-4o-mini-tts",
        }),
        text: "Stir in the rice.",
        voice: "marin",
      }),
    ])
  })
})

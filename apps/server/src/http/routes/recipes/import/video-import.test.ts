import { join } from "node:path"
import sharp from "sharp"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../../app.ts"
import type { AiTarget } from "../../../../services/ai/providers.ts"
import type { Fetcher } from "../../../../services/fetch/public-fetch.ts"
import {
  ytDlpError,
  type VideoInfo,
  type VideoTools,
} from "../../../../services/video/tools.ts"
import {
  fakeAiFetcher,
  GOOD_KEYS,
  mockAiModels,
  type MockCall,
} from "../../../../test/ai.ts"
import { createTestApp, setUpServer, TestClient } from "../../../../test/app.ts"

// Recipes from video links. yt-dlp and ffmpeg are fakes here: `videos` is
// what probing a link finds, and what was downloaded and heard is kept.
// The model answers with LEMON, and what it was given is kept in `given`.

type Part = { type: string; text?: string; mediaType?: string }
type Prompt = { role: string; content: string | Part[] }[]

const LEMON = {
  found: true,
  name: "Lemon Chicken",
  description: null,
  servings: 4,
  yieldText: null,
  prepMinutes: 10,
  cookMinutes: 40,
  totalMinutes: null,
  ingredients: ["4 chicken thighs", "2 lemons"],
  steps: ["Roast the chicken with the lemons."],
  notes: null,
  tags: [],
}

let given: Part[] = []
const reply = (call: MockCall) => {
  given = (call.prompt as Prompt)
    .filter((m) => m.role === "user")
    .flatMap((m) => m.content as Part[])
  return JSON.stringify(LEMON)
}

const videos = new Map<string, VideoInfo>()
let tools: { ytDlp: string | null; ffmpeg: string | null } = {
  ytDlp: "2026.08.19",
  ffmpeg: "8.0",
}
const downloads: { url: string; audioOnly: boolean }[] = []
const heard: AiTarget[] = []
let frame: Buffer

const video: VideoTools = {
  check: async () => tools,
  probe: async (url) => {
    const info = videos.get(url)
    if (!info) {
      throw ytDlpError(
        Object.assign(new Error("failed"), {
          stderr: "ERROR: [youtube] gone: Video unavailable",
        })
      )
    }
    return info
  },
  download: async (url, dir, { audioOnly }) => {
    downloads.push({ url, audioOnly })
    return join(dir, "video.mp4")
  },
  extractAudio: async () => Buffer.from("the sound"),
  frames: async (_file, _dir, count) =>
    Array.from({ length: count }, () => frame),
  update: async () => null,
}

const CAPTIONS = [
  "WEBVTT",
  "",
  "00:00:00.000 --> 00:00:02.000",
  "rub the chicken with lemon",
  "",
  "00:00:02.000 --> 00:00:04.000",
  "rub the chicken with lemon",
  "then roast it for forty minutes",
].join("\n")

let photo: Buffer
const aiFetcher = fakeAiFetcher()
const fetcher: Fetcher = async (url, options) => {
  if (url === "https://captions.example/lemon.vtt") {
    return {
      url,
      status: 200,
      contentType: "text/vtt",
      body: Buffer.from(CAPTIONS),
    }
  }
  if (url === "https://thumbs.example/lemon.jpg") {
    return { url, status: 200, contentType: "image/jpeg", body: photo }
  }
  return aiFetcher(url, options)
}

let app: App
let close: () => Promise<void>
let kyle: TestClient

beforeAll(async () => {
  frame = await sharp({
    create: { width: 320, height: 568, channels: 3, background: "#c84" },
  })
    .jpeg()
    .toBuffer()
  photo = await sharp({
    create: { width: 720, height: 1280, channels: 3, background: "#eda" },
  })
    .jpeg()
    .toBuffer()
  const test = await createTestApp({
    fetcher,
    ai: mockAiModels(undefined, [], undefined, reply),
    video,
    transcribe: async (target) => {
      heard.push(target)
      return { text: "two cups of flour and a pinch of salt", seconds: 90 }
    },
  })
  ;({ app, close } = test)
  kyle = await setUpServer(app, test.setupCode)
  const key = await kyle.post("/api/settings/server/ai/keys", {
    provider: "anthropic",
    key: GOOD_KEYS.anthropic,
  })
  expect(key.status, await key.clone().text()).toBe(201)
})

afterAll(() => close())

const importLink = async (url: string) => {
  const res = await kyle.post("/api/recipes/import", { url })
  return { status: res.status, body: await res.json() }
}

describe("a video link", () => {
  test("is read from its caption, captions and frames, with its thumbnail", async () => {
    videos.set("https://www.youtube.com/shorts/lemon", {
      url: "https://www.youtube.com/watch?v=lemon",
      title: "Lemon chicken in 40 minutes",
      description: "Lemon chicken! 4 thighs, 2 lemons.",
      uploader: "Sam Cooks",
      duration: 58,
      thumbnail: "https://thumbs.example/lemon.jpg",
      captions: { url: "https://captions.example/lemon.vtt", lang: "en" },
    })
    const { status, body } = await importLink(
      "https://www.youtube.com/shorts/lemon"
    )
    expect(status, JSON.stringify(body)).toBe(201)
    expect(body.recipe).toMatchObject({
      name: "Lemon Chicken",
      origin: "video",
      sourceUrl: "https://www.youtube.com/watch?v=lemon",
      photo: expect.objectContaining({ card: expect.any(String) }),
    })

    // A short video: frames from a small copy, and its captions, unrepeated.
    expect(downloads).toEqual([
      { url: "https://www.youtube.com/shorts/lemon", audioOnly: false },
    ])
    expect(
      given.filter((part) => part.mediaType === "image/jpeg")
    ).toHaveLength(8)
    const text = given.at(-1)!.text!
    expect(text).toContain("Video: Lemon chicken in 40 minutes")
    expect(text).toContain("By: Sam Cooks")
    expect(text).toContain(
      "Caption or description:\nLemon chicken! 4 thighs, 2 lemons."
    )
    expect(text).toContain(
      "What's said in the video:\nrub the chicken with lemon\nthen roast it for forty minutes"
    )
    expect(heard).toEqual([])
  })

  test("that's already in, by its short link, is that recipe", async () => {
    downloads.length = 0
    videos.set("https://youtu.be/lemon", {
      ...videos.get("https://www.youtube.com/shorts/lemon")!,
    })
    const { status, body } = await importLink("https://youtu.be/lemon")
    expect(status).toBe(200)
    expect(body).toMatchObject({
      duplicate: true,
      recipe: { name: "Lemon Chicken" },
    })
    expect(downloads).toEqual([])
  })

  test("with nothing to read says so", async () => {
    videos.set("https://www.tiktok.com/@sam/video/1", {
      url: "https://www.tiktok.com/@sam/video/1",
      title: null,
      description: null,
      uploader: null,
      duration: 600,
      thumbnail: null,
      captions: null,
    })
    const { status, body } = await importLink(
      "https://www.tiktok.com/@sam/video/1"
    )
    expect(status).toBe(422)
    expect(body.error).toMatchObject({
      code: "video_nothing_to_read",
      message: expect.stringContaining("With an OpenAI key"),
    })
  })

  test("without captions is listened to, on an OpenAI key", async () => {
    const key = await kyle.post("/api/settings/server/ai/keys", {
      provider: "openai",
      key: GOOD_KEYS.openai,
    })
    expect(key.status, await key.clone().text()).toBe(201)
    downloads.length = 0
    videos.set("https://www.youtube.com/watch?v=bread", {
      url: "https://www.youtube.com/watch?v=bread",
      title: "Soda bread",
      description: null,
      uploader: null,
      duration: 600,
      thumbnail: null,
      captions: null,
    })
    const { status, body } = await importLink(
      "https://www.youtube.com/watch?v=bread"
    )
    expect(status, JSON.stringify(body)).toBe(201)
    // A long video: just its sound.
    expect(downloads).toEqual([
      { url: "https://www.youtube.com/watch?v=bread", audioOnly: true },
    ])
    expect(heard.at(-1)).toMatchObject({
      provider: "openai",
      model: "gpt-4o-mini-transcribe",
      apiKey: GOOD_KEYS.openai,
    })
    expect(given.at(-1)!.text).toContain(
      "What's said in the video:\ntwo cups of flour and a pinch of salt"
    )
    // 90 seconds at $0.003 a minute, on the import's spend.
    const ai = await (await kyle.get("/api/households/current/ai")).json()
    expect(
      ai.usage.tasks.find((task: { task: string }) => task.task === "import")
    ).toMatchObject({ calls: 3 })
  })

  test("that's gone says so", async () => {
    const { status, body } = await importLink(
      "https://www.youtube.com/watch?v=gone"
    )
    expect(status).toBe(422)
    expect(body.error.code).toBe("video_unavailable")
  })
})

describe("video import", () => {
  test("says when it's off, or its tools aren't there", async () => {
    const off = await kyle.patch("/api/settings/server", {
      "video.enabled": false,
    })
    expect(off.status, await off.clone().text()).toBe(200)
    let res = await importLink("https://www.youtube.com/watch?v=new")
    expect(res.body.error.code).toBe("video_off")
    let capabilities = await (await kyle.get("/api/capabilities")).json()
    expect(capabilities.modules).toContainEqual({
      id: "video",
      on: false,
      needs: "off",
    })
    await kyle.patch("/api/settings/server", { "video.enabled": true })

    tools = { ytDlp: null, ffmpeg: "8.0" }
    res = await importLink("https://www.youtube.com/watch?v=new")
    expect(res.body.error.code).toBe("video_tools_missing")
    capabilities = await (await kyle.get("/api/capabilities")).json()
    expect(capabilities.modules).toContainEqual({
      id: "video",
      on: false,
      needs: "ytDlp",
    })
    tools = { ytDlp: "2026.08.19", ffmpeg: "8.0" }
    capabilities = await (await kyle.get("/api/capabilities")).json()
    expect(capabilities.capabilities).toContain("video")
  })

  test("shows its tools to the server admin", async () => {
    const server = await (await kyle.get("/api/settings/server")).json()
    expect(server.video).toEqual({
      ytDlp: "2026.08.19",
      ffmpeg: "8.0",
      cookies: false,
    })
  })
})

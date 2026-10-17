import { describe, expect, test } from "vitest"
import { captionsToText, pickCaptions, ytDlpError } from "./tools.ts"

describe("pickCaptions", () => {
  const vtt = (url: string) => [
    { ext: "json3", url: `${url}.json` },
    { ext: "vtt", url },
  ]

  test("prefers written English captions", () => {
    expect(
      pickCaptions({
        subtitles: { de: vtt("de"), "en-US": vtt("written") },
        automatic_captions: { "en-orig": vtt("auto") },
      })
    ).toEqual({ url: "written", lang: "en-US" })
  })

  test("then what was actually said, over machine translations", () => {
    expect(
      pickCaptions({
        language: "es",
        automatic_captions: { en: vtt("translated"), "es-orig": vtt("spoken") },
      })
    ).toEqual({ url: "spoken", lang: "es-orig" })
  })

  test("of a dubbed video, what was said in its own language, not a dub's", () => {
    // YouTube's dubs each have their own "-orig"; Arabic comes first.
    const dubbed = {
      "ar-orig": vtt("arabic"),
      ar: vtt("arabic translated"),
      "de-DE-orig": vtt("german"),
      en: vtt("english translated"),
      "en-orig": vtt("english"),
    }
    expect(
      pickCaptions({ language: "en-US", automatic_captions: dubbed })
    ).toEqual({ url: "english", lang: "en-orig" })
    // Not knowing its language, English as said.
    expect(pickCaptions({ automatic_captions: dubbed })).toEqual({
      url: "english",
      lang: "en-orig",
    })
    // Not dubbed: what was said, whatever the language.
    expect(
      pickCaptions({
        automatic_captions: { "es-orig": vtt("spanish"), en: vtt("en") },
      })
    ).toEqual({ url: "spanish", lang: "es-orig" })
  })

  test("is null without captions it can use", () => {
    expect(pickCaptions({})).toBeNull()
    expect(
      pickCaptions({ subtitles: { live_chat: vtt("chat"), fr: vtt("fr") } })
    ).toBeNull()
  })
})

describe("captionsToText", () => {
  test("keeps the words, without timings, tags or rolling repeats", () => {
    const vtt = [
      "WEBVTT",
      "Kind: captions",
      "Language: en",
      "",
      "00:00:00.000 --> 00:00:02.000 align:start position:0%",
      "first you<00:00:01.000><c> melt</c><c> the butter</c>",
      "",
      "00:00:02.000 --> 00:00:04.000",
      "first you melt the butter",
      "add two cloves of garlic",
      "",
      "3",
      "00:00:04.000 --> 00:00:06.000",
      "add two cloves of garlic",
      "salt &amp; pepper",
    ].join("\n")
    expect(captionsToText(vtt)).toBe(
      "first you melt the butter\nadd two cloves of garlic\nsalt & pepper"
    )
  })
})

describe("ytDlpError", () => {
  test.each([
    [{ code: "ENOENT" }, "video_tools_missing"],
    [{ killed: true }, "video_timeout"],
    [
      {
        stderr:
          "ERROR: [Instagram] abc: Requested content is not available, rate-limit reached or login required",
      },
      "video_needs_sign_in",
    ],
    [
      {
        stderr:
          "ERROR: [youtube] abc: Sign in to confirm you're not a bot. Use --cookies-from-browser or --cookies",
      },
      "video_needs_sign_in",
    ],
    [
      { stderr: "ERROR: [youtube] abc: Video unavailable" },
      "video_unavailable",
    ],
    [{ stderr: "ERROR: Unsupported URL: https://example.com" }, "not_a_video"],
    [{ stderr: "ERROR: something new" }, "video_failed"],
  ])("says what went wrong: %j", (failure, code) => {
    expect(ytDlpError(Object.assign(new Error("failed"), failure)).code).toBe(
      code
    )
  })
})

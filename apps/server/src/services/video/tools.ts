import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import type { Logger } from "pino"
import { AppError } from "../../core/errors.ts"
import { VIDEO } from "../../modules/video/settings.ts"
import type { Settings } from "../settings/settings.ts"

// yt-dlp and ffmpeg, which read recipes out of TikTok, YouTube, Instagram
// and Facebook videos: the video's details and captions without
// downloading it, and for short ones a small copy, for frames and sound.
// Only links to those sites get here (see recipes/import/links.ts). They
// run without a shell, ignoring any config of their own, with time and
// size limits, into a folder of their own that's deleted after.

export type VideoCaptions = { url: string; lang: string }

export type VideoInfo = {
  /** Its own link, which a short link leads to. */
  url: string
  title: string | null
  /** The caption: often the whole recipe. */
  description: string | null
  uploader: string | null
  /** Seconds, when the site says. */
  duration: number | null
  thumbnail: string | null
  captions: VideoCaptions | null
}

/** What video import needs from yt-dlp and ffmpeg. Tests pass a fake. */
export type VideoTools = {
  /** Whether each is there, by its version, or null. */
  check(): Promise<{ ytDlp: string | null; ffmpeg: string | null }>
  /** Reads the video's details without downloading it. */
  probe(url: string): Promise<VideoInfo>
  /** Downloads a small copy (480p or less, or just the sound) into `dir`. */
  download(
    url: string,
    dir: string,
    options: { audioOnly: boolean }
  ): Promise<string>
  /** Mono 32 kbps MP3, small enough to transcribe. */
  extractAudio(file: string, dir: string): Promise<Buffer>
  /** `count` JPEG frames spread across the video. */
  frames(
    file: string,
    dir: string,
    count: number,
    duration: number | null
  ): Promise<Buffer[]>
  /** Updates yt-dlp to its newest build; says what it did, or null. */
  update(): Promise<string | null>
}

/** Downloads at once, server-wide: they're the heavy part. */
const MAX_DOWNLOADS = 2

/** How long a check is believed, so Settings isn't running them each time. */
const CHECK_MS = 60_000

type Ran = { stdout: string; stderr: string }
type Failed = Error & {
  code?: string | number
  stderr?: string
  killed?: boolean
}

function run(command: string, args: string[], timeout: number) {
  return new Promise<Ran>((resolve, reject) => {
    execFile(
      command,
      args,
      { timeout, maxBuffer: 64 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          reject(Object.assign(error, { stderr: String(stderr) }))
        } else {
          resolve({ stdout: String(stdout), stderr: String(stderr) })
        }
      }
    )
  })
}

/** A yt-dlp failure, said so it's worth showing. */
export function ytDlpError(error: unknown, logger?: Logger): AppError {
  const { code, stderr = "", killed } = error as Failed
  if (code === "ENOENT") {
    return new AppError(
      "unprocessable",
      "video_tools_missing",
      "Video import needs yt-dlp and ffmpeg. They come with the Docker image; elsewhere, the server admin can install them."
    )
  }
  if (killed) {
    return new AppError(
      "upstream",
      "video_timeout",
      "That video took too long to read. Try again in a bit."
    )
  }
  // Instagram's "login required", YouTube's "Sign in to confirm you're not a bot".
  if (
    /login required|rate-limit|sign in to confirm|use --cookies/i.test(stderr)
  ) {
    return new AppError(
      "unprocessable",
      "video_needs_sign_in",
      "That site wants a signed-in session for this video. The server admin can give Merran a cookies.txt (see the docs)."
    )
  }
  if (
    /private|unavailable|removed|not available|does not exist/i.test(stderr)
  ) {
    return new AppError(
      "unprocessable",
      "video_unavailable",
      "That video isn't available. It may be private or deleted."
    )
  }
  if (/unsupported url/i.test(stderr)) {
    return new AppError(
      "unprocessable",
      "not_a_video",
      "That doesn't look like a link to a video."
    )
  }
  logger?.warn(
    {
      err:
        stderr.split("\n").find((line) => line.startsWith("ERROR:")) ??
        stderr.slice(-500),
    },
    "yt-dlp failed"
  )
  return new AppError(
    "upstream",
    "video_failed",
    "Merran couldn't read that video."
  )
}

type Track = { ext?: string; url?: string }

/** A caption track's language without its region or "-orig": "en-US-orig" is "en". */
const languageOf = (lang: string) =>
  lang
    .replace(/-orig$/i, "")
    .toLowerCase()
    .split(/[-_]/)[0]!

/**
 * The captions to read: written ones in the video's own language, or
 * English; then what was actually said ("-orig"), in the video's own
 * language. A dubbed video has an "-orig" for each dub, so another's is
 * only taken when there's just the one. Machine translations come last.
 */
export function pickCaptions(raw: {
  language?: string | null
  subtitles?: Record<string, Track[]> | null
  automatic_captions?: Record<string, Track[]> | null
}): VideoCaptions | null {
  const own = raw.language ? languageOf(raw.language) : null
  const isOwn = (lang: string) => own !== null && languageOf(lang) === own
  const isEnglish = (lang: string) => languageOf(lang) === "en"
  const said = (lang: string) => /-orig$/i.test(lang)
  const written = raw.subtitles ?? {}
  const automatic = raw.automatic_captions ?? {}
  const spoken = Object.keys(automatic).filter(said)
  const sources: [Record<string, Track[]>, (lang: string) => boolean][] = [
    [written, isOwn],
    [written, isEnglish],
    [automatic, (lang) => said(lang) && isOwn(lang)],
    [automatic, (lang) => said(lang) && spoken.length === 1],
    [automatic, (lang) => said(lang) && isEnglish(lang)],
    [automatic, isOwn],
    [automatic, isEnglish],
  ]
  for (const [tracks, accept] of sources) {
    for (const [lang, formats] of Object.entries(tracks)) {
      if (!accept(lang) || lang === "live_chat") continue
      const vtt = formats.find((format) => format.ext === "vtt" && format.url)
      if (vtt?.url) return { url: vtt.url, lang }
    }
  }
  return null
}

/** WebVTT captions as plain text, without the repeats rolling captions have. */
export function captionsToText(vtt: string) {
  const lines: string[] = []
  for (const raw of vtt.split(/\r?\n/)) {
    const line = raw
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .trim()
    if (
      !line ||
      line === "WEBVTT" ||
      /^(Kind|Language|NOTE|STYLE|REGION)\b/.test(line) ||
      /-->/.test(line) ||
      /^\d+$/.test(line)
    ) {
      continue
    }
    if (lines.at(-1) !== line) lines.push(line)
  }
  return lines.join("\n")
}

/** A program: where it was set, else in the data folder's tools, else on the PATH. */
function locate(dataDir: string, name: string, set: string | null) {
  if (set) return set
  for (const file of [name, `${name}.exe`]) {
    const path = join(dataDir, "tools", file)
    if (existsSync(path)) return path
  }
  return name
}

/** yt-dlp and ffmpeg on this machine. */
export function createVideoTools(options: {
  dataDir: string
  settings: Settings
  logger: Logger
}): VideoTools {
  const { dataDir, settings, logger } = options
  const ytDlp = async () =>
    locate(dataDir, "yt-dlp", await settings.server(VIDEO.ytDlpPath))
  const ffmpeg = async () =>
    locate(dataDir, "ffmpeg", await settings.server(VIDEO.ffmpegPath))

  async function commonArgs() {
    const args = [
      "--ignore-config",
      "--no-playlist",
      "--no-warnings",
      "--no-progress",
      "--socket-timeout",
      "20",
      // YouTube needs a JavaScript runtime now; Node is already here.
      "--js-runtimes",
      "node",
    ]
    const cookies =
      (await settings.server(VIDEO.cookiesFile)) ?? join(dataDir, "cookies.txt")
    if (existsSync(cookies)) args.push("--cookies", cookies)
    return args
  }

  // A few downloads at once, the rest waiting their turn.
  let downloading = 0
  const queue: (() => void)[] = []
  async function turn<T>(work: () => Promise<T>) {
    if (downloading >= MAX_DOWNLOADS) {
      await new Promise<void>((resolve) => queue.push(resolve))
    }
    downloading++
    try {
      return await work()
    } finally {
      downloading--
      queue.shift()?.()
    }
  }

  let checked: {
    at: number
    result: Promise<{ ytDlp: string | null; ffmpeg: string | null }>
  } | null = null
  const version = async (command: string, args: string[]) => {
    try {
      const { stdout } = await run(command, args, 15_000)
      return stdout.trim().split("\n")[0]?.trim() || null
    } catch {
      return null
    }
  }

  return {
    check() {
      if (!checked || Date.now() - checked.at > CHECK_MS) {
        checked = {
          at: Date.now(),
          result: (async () => {
            const [y, f] = await Promise.all([
              version(await ytDlp(), ["--version"]),
              version(await ffmpeg(), ["-version"]),
            ])
            return {
              ytDlp: y,
              ffmpeg: f?.match(/^ffmpeg version (\S+)/)?.[1] ?? f,
            }
          })(),
        }
      }
      return checked.result
    },

    async probe(url) {
      let stdout: string
      try {
        ;({ stdout } = await run(
          await ytDlp(),
          [
            ...(await commonArgs()),
            "--dump-single-json",
            "--skip-download",
            "--",
            url,
          ],
          90_000
        ))
      } catch (error) {
        throw ytDlpError(error, logger)
      }
      const info = JSON.parse(stdout) as Record<string, unknown>
      const text = (key: string) =>
        typeof info[key] === "string" && info[key]
          ? (info[key] as string)
          : null
      return {
        url: text("webpage_url") ?? url,
        title: text("title") ?? text("fulltitle"),
        description: text("description"),
        uploader: text("uploader") ?? text("channel") ?? text("creator"),
        duration: typeof info.duration === "number" ? info.duration : null,
        thumbnail: text("thumbnail"),
        captions: pickCaptions(info as Parameters<typeof pickCaptions>[0]),
      }
    },

    download(url, dir, { audioOnly }) {
      return turn(async () => {
        const format = audioOnly
          ? "ba/b[height<=360]/w"
          : "b[height<=480]/bv*[height<=480]+ba/w"
        let stdout: string
        try {
          ;({ stdout } = await run(
            await ytDlp(),
            [
              ...(await commonArgs()),
              "--ffmpeg-location",
              await ffmpeg(),
              "-f",
              format,
              "--merge-output-format",
              "mp4",
              "--max-filesize",
              "200M",
              "-o",
              join(dir, "video.%(ext)s"),
              "--no-simulate",
              "--print",
              "after_move:filepath",
              "--",
              url,
            ],
            240_000
          ))
        } catch (error) {
          throw ytDlpError(error, logger)
        }
        const file = stdout.trim().split("\n").at(-1)?.trim()
        if (!file) {
          throw new AppError(
            "upstream",
            "video_failed",
            "Merran couldn't download that video."
          )
        }
        return file
      })
    },

    async extractAudio(file, dir) {
      const out = join(dir, "audio.mp3")
      try {
        await run(
          await ffmpeg(),
          [
            "-v",
            "error",
            "-y",
            "-i",
            file,
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-b:a",
            "32k",
            out,
          ],
          120_000
        )
      } catch (error) {
        logger.warn({ err: (error as Failed).stderr }, "ffmpeg (sound) failed")
        throw new AppError(
          "upstream",
          "video_failed",
          "Merran couldn't get the sound out of that video."
        )
      }
      return readFile(out)
    },

    async frames(file, dir, count, duration) {
      // Spread evenly, skipping the first and last few percent: usually a
      // title card or an outro.
      const rate = duration && duration > 0 ? count / (duration * 0.9) : 0.25
      try {
        await run(
          await ffmpeg(),
          [
            "-v",
            "error",
            "-y",
            ...(duration ? ["-ss", String(duration * 0.05)] : []),
            "-i",
            file,
            "-vf",
            `fps=${rate.toFixed(4)},scale='min(768,iw)':-2`,
            "-frames:v",
            String(count),
            "-q:v",
            "5",
            join(dir, "frame-%02d.jpg"),
          ],
          120_000
        )
      } catch (error) {
        logger.warn({ err: (error as Failed).stderr }, "ffmpeg (frames) failed")
        return []
      }
      const names = (await readdir(dir))
        .filter((name) => name.startsWith("frame-"))
        .sort()
      return Promise.all(names.map((name) => readFile(join(dir, name))))
    },

    async update() {
      try {
        const { stdout } = await run(
          await ytDlp(),
          ["--ignore-config", "--update-to", "nightly"],
          120_000
        )
        checked = null
        return stdout.trim().split("\n").at(-1)?.trim() || null
      } catch (error) {
        const { code, stderr } = error as Failed
        // Not there (a computer without it) or can't be written: nothing to do.
        if (code !== "ENOENT") {
          logger.warn(
            { err: stderr?.trim().split("\n").at(-1) },
            "yt-dlp didn't update"
          )
        }
        return null
      }
    },
  }
}

/** Video tools that aren't there, for tests and computers without them. */
export const NO_VIDEO_TOOLS: VideoTools = {
  check: async () => ({ ytDlp: null, ffmpeg: null }),
  probe: async () => {
    throw ytDlpError(Object.assign(new Error("missing"), { code: "ENOENT" }))
  },
  download: async () => {
    throw ytDlpError(Object.assign(new Error("missing"), { code: "ENOENT" }))
  },
  extractAudio: async () => Buffer.alloc(0),
  frames: async () => [],
  update: async () => null,
}

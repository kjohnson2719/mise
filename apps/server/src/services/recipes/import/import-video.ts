import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { EntityManager } from "@mikro-orm/sql"
import type { UserContent } from "ai"
import type { AppDeps } from "../../../core/context.ts"
import { AppError } from "../../../core/errors.ts"
import { VIDEO } from "../../../modules/video/settings.ts"
import { aiUnavailable } from "../../ai/run.ts"
import { resolveTask } from "../../ai/status.ts"
import { transcribeFor, transcriptionFor } from "../../ai/transcribe.ts"
import type { FileStore } from "../../storage/files.ts"
import { captionsToText } from "../../video/tools.ts"
import { removePhoto, storePhoto } from "../photos.ts"
import { createRecipe } from "../recipes.ts"
import { tidyAfterImport } from "../review/tidy-run.ts"
import { readRecipe, type AiDeps } from "./ai-reader.ts"
import { downloadPhoto, type ImportResult } from "./import-link.ts"
import { normalizeLink } from "./links.ts"

// A recipe from a TikTok, YouTube, Instagram or Facebook video. It's
// usually split across the caption, what's said and what's shown, so all
// three are read: the caption and captions from yt-dlp without downloading
// anything, the sound turned into words when there are no captions (on an
// OpenAI key), and for short videos a few frames, where amounts are often
// written on screen. The import model writes it up like pasted text.

export type VideoDeps = Pick<AppDeps, "video" | "transcribe">

/** Short-form videos get frames read too. */
const SHORT_VIDEO_SECONDS = 5 * 60
const FRAME_COUNT = 8
/** Longer than this, listening costs more than it's likely worth. */
const MAX_LISTEN_SECONDS = 30 * 60
/** What's said past this is left out; the recipe's nearly always before it. */
const MAX_TRANSCRIPT = 30_000

/** A video's captions as text, or none: a missing track isn't worth failing over. */
async function fetchCaptions(fetcher: AiDeps["fetcher"], url: string) {
  try {
    const { body } = await fetcher(url, {
      accept: "text/vtt,*/*",
      maxBytes: 5_000_000,
    })
    return captionsToText(body.toString("utf8")) || null
  } catch {
    return null
  }
}

/** Whether this server can import videos, or why not. */
export async function videoImportReady(
  deps: Pick<AppDeps, "settings" | "video">
) {
  if (!(await deps.settings.server(VIDEO.enabled))) {
    throw new AppError(
      "unprocessable",
      "video_off",
      "Video import is off on this server. The server admin can turn it on in Settings, This server."
    )
  }
  const tools = await deps.video.check()
  if (!tools.ytDlp || !tools.ffmpeg) {
    throw new AppError(
      "unprocessable",
      "video_tools_missing",
      "Video import needs yt-dlp and ffmpeg on the server. They come with the Docker image; elsewhere, the server admin can install them."
    )
  }
}

export async function importVideo(
  em: EntityManager,
  deps: AiDeps & VideoDeps & { files: FileStore },
  options: {
    householdId: string
    userId: string | null
    url: string
    /** The recipe already made from one of these links, unless forced. */
    already: (urls: string[]) => Promise<ImportResult | null>
  }
): Promise<ImportResult> {
  const { householdId, userId } = options
  await videoImportReady(deps)
  // AI reads it, so without AI there's no point downloading anything.
  const importing = await resolveTask(deps, em, householdId, "import")
  if (!importing.ok) throw aiUnavailable(importing.why)

  const info = await deps.video.probe(options.url)
  const sourceUrl = normalizeLink(info.url)
  // A short link leads to the video's own, which may be in already.
  if (sourceUrl !== options.url) {
    const known = await options.already([sourceUrl])
    if (known) return known
  }

  let transcript = info.captions
    ? await fetchCaptions(deps.fetcher, info.captions.url)
    : null
  const short = info.duration === null || info.duration <= SHORT_VIDEO_SECONDS
  const listen =
    !transcript &&
    (info.duration ?? 0) <= MAX_LISTEN_SECONDS &&
    (await transcriptionFor(deps, em, householdId)) !== null

  const dir = await mkdtemp(join(tmpdir(), "merran-video-"))
  let frames: Buffer[] = []
  try {
    if (short || listen) {
      const file = await deps.video.download(options.url, dir, {
        audioOnly: !short,
      })
      if (short) {
        frames = await deps.video.frames(file, dir, FRAME_COUNT, info.duration)
      }
      if (listen) {
        try {
          transcript = await transcribeFor(deps, em, {
            householdId,
            userId,
            audio: await deps.video.extractAudio(file, dir),
            seconds: info.duration,
          })
        } catch {
          // The caption and frames may be enough; it says so below if not.
        }
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }

  if (!info.description && !transcript && frames.length === 0) {
    throw new AppError(
      "unprocessable",
      "video_nothing_to_read",
      listen
        ? "Merran couldn't find anything to read in that video: no caption, and it couldn't make out what's said."
        : "That video has no caption or captions to read. With an OpenAI key, Merran can listen to it too."
    )
  }

  const text = [
    `Video: ${info.title ?? "(untitled)"}`,
    info.uploader && `By: ${info.uploader}`,
    `Link: ${sourceUrl}`,
    info.description && `Caption or description:\n${info.description}`,
    transcript &&
      `What's said in the video:\n${transcript.slice(0, MAX_TRANSCRIPT)}`,
    frames.length > 0 &&
      `The ${frames.length} images are frames from the video, in order.`,
  ]
    .filter(Boolean)
    .join("\n\n")
  const content: Exclude<UserContent, string> = [
    ...frames.map((frame) => ({
      type: "file" as const,
      data: frame,
      mediaType: "image/jpeg",
    })),
    { type: "text", text },
  ]
  const input = await readRecipe(deps, em, {
    householdId,
    userId,
    content,
    source: "video",
    sourceUrl,
  })

  const photo = info.thumbnail
    ? await downloadPhoto(deps.fetcher, [info.thumbnail], sourceUrl)
    : null
  const photoId = photo
    ? await storePhoto(deps.files, householdId, photo).catch(() => null)
    : null
  try {
    const recipe = await createRecipe(em, {
      householdId,
      userId,
      input,
      origin: "video",
      photoId,
    })
    await tidyAfterImport(em, { householdId, userId, recipeId: recipe.id })
    return { recipe, duplicate: false }
  } catch (err) {
    await removePhoto(deps.files, householdId, photoId)
    throw err
  }
}

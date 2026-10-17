import type { Module } from "../module.ts"
import { VIDEO } from "./settings.ts"

/** yt-dlp checks for a newer build this often, after a minute at start. */
const UPDATE_EVERY = 7 * 24 * 60 * 60_000

let updates: { start: NodeJS.Timeout; every: NodeJS.Timeout } | null = null

/**
 * Video import: recipes from TikTok, YouTube, Instagram and Facebook links,
 * through yt-dlp and ffmpeg (in the Docker image). On by default, when both
 * are there; AI reads what they find, so a household needs AI for it too.
 */
export const video: Module = {
  id: "video",
  settings: Object.values(VIDEO),
  capabilities: ["video"],

  async status({ settings, video }) {
    if (!(await settings.server(VIDEO.enabled))) {
      return { on: false, needs: "off" }
    }
    const tools = await video.check()
    if (!tools.ytDlp) return { on: false, needs: "ytDlp" }
    if (!tools.ffmpeg) return { on: false, needs: "ffmpeg" }
    return { on: true }
  },

  /** Keeps yt-dlp current, unless that's off or Merran keeps to itself. */
  async apply({ settings, video, logger }) {
    if (updates) {
      clearTimeout(updates.start)
      clearInterval(updates.every)
      updates = null
    }
    if (
      !(await settings.server(VIDEO.enabled)) ||
      !(await settings.server(VIDEO.autoUpdate))
    ) {
      return
    }
    const update = () =>
      void video.update().then((said) => {
        if (said) logger.info(`yt-dlp: ${said}`)
      })
    updates = {
      start: setTimeout(update, 60_000).unref(),
      every: setInterval(update, UPDATE_EVERY).unref(),
    }
  },
}

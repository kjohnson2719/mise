import { switchSetting, textSetting } from "../../core/settings.ts"

// Where yt-dlp and ffmpeg are, and the cookies some sites want, can only
// come from the environment: the app never runs a program or reads a file
// someone typed into Settings.

export const VIDEO = {
  enabled: switchSetting({
    key: "video.enabled",
    env: "MERRAN_VIDEO_IMPORT",
    description:
      "Import recipes from TikTok, YouTube, Instagram and Facebook links. Needs yt-dlp and ffmpeg, which come with the Docker image, and AI.",
    default: true,
  }),
  autoUpdate: switchSetting({
    key: "video.autoUpdate",
    env: "MERRAN_YTDLP_AUTO_UPDATE",
    description:
      "Keep yt-dlp up to date, at start and weekly: it breaks when sites change, and is fixed within days.",
    default: true,
  }),
  ytDlpPath: textSetting({
    key: "video.ytDlpPath",
    env: "MERRAN_YTDLP_PATH",
    envOnly: true,
    description:
      "Where yt-dlp is. Without it, Merran looks in its data folder's `tools` folder, then on the PATH.",
  }),
  ffmpegPath: textSetting({
    key: "video.ffmpegPath",
    env: "MERRAN_FFMPEG_PATH",
    envOnly: true,
    description:
      "Where ffmpeg is. Without it, Merran looks in its data folder's `tools` folder, then on the PATH.",
  }),
  cookiesFile: textSetting({
    key: "video.cookiesFile",
    env: "MERRAN_YTDLP_COOKIES",
    envOnly: true,
    description:
      "A cookies.txt from a browser, for sites that want a signed-in session (often Instagram). Without it, Merran uses `cookies.txt` in its data folder, if there is one.",
  }),
}

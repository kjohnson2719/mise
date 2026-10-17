import type { EntityManager } from "@mikro-orm/sql"
import { Recipe } from "../../../database/entities/index.ts"
import { checkLink } from "../../fetch/public-fetch.ts"

const TRACKING_PARAM =
  /^(utm_\w+|fbclid|gclid|mc_cid|mc_eid|igshid|igsh|si|feature|_r|_t)$/i

/** A link tidied to compare and keep: no #part, no tracking parameters. */
export function normalizeLink(raw: string) {
  const url = checkLink(raw.trim())
  url.hash = ""
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAM.test(key)) url.searchParams.delete(key)
  }
  return url.toString()
}

const VIDEO_HOSTS =
  /(^|\.)(tiktok\.com|youtube\.com|youtu\.be|instagram\.com|instagr\.am|facebook\.com|fb\.watch)$/i

/** TikTok, YouTube, Instagram and Facebook links, which need the video importer. */
export function isVideoLink(url: string) {
  return VIDEO_HOSTS.test(new URL(url).hostname)
}

/** A recipe the household already has from one of these links, if any. */
export function findBySourceUrl(em: EntityManager, urls: string[]) {
  return em.findOne(
    Recipe,
    { sourceUrl: { $in: [...new Set(urls)] } },
    { orderBy: { createdAt: "asc" } }
  )
}

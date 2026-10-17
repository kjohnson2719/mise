import { randomBytes } from "node:crypto"
import { dietsFor } from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import type { Logger } from "pino"
import sharp from "sharp"
import { AppError } from "../../core/errors.ts"
import {
  RecipeSite,
  SiteRecipe,
  type SiteRecipeState,
} from "../../database/entities/index.ts"
import type { Fetcher } from "../fetch/public-fetch.ts"
import { decodeHtml } from "../recipes/import/import-link.ts"
import { isVideoLink, normalizeLink } from "../recipes/import/links.ts"
import {
  readRecipeData,
  type RecipeData,
} from "../recipes/import/recipe-data.ts"
import type { FileStore } from "../storage/files.ts"
import { COURSES, type Course } from "./data.ts"
import { looksLikeFeed, parseFeed } from "./feeds.ts"
import { allowedByRobots, robotsFor } from "./robots.ts"

// The shelf: recipe pages Merran read from sites' feeds, and the starter
// collections' classics, kept once for every household (docs/platform.md,
// "Recipe sites and starter collections"). Merran reads like a polite
// visitor: robots.txt first, feeds only when they've changed, and one page
// at a time per site, a few seconds apart.

export type ShelfDeps = { fetcher: Fetcher; files: FileStore; logger: Logger }

/**
 * Seconds between pages from one site, unless its robots.txt asks for
 * more. Tests set it to nothing.
 */
export const PACE = { seconds: 3 }
const MOST_PAUSE_SECONDS = 30

/** How often a feed is read, and sooner while posts are still to open. */
const READ_EVERY_MS = 6 * 60 * 60_000
const SOON_MS = 30 * 60_000

/** Posts opened each time a site is read. */
const OPEN_EACH_READ = 12

/** Times in a row a page won't open before it's given up on. */
const MOST_FAILURES = 3

/** Recipes kept from each site: its newest. */
const KEEP_PER_SITE = 120

/** Posts that weren't recipes, kept to not open them again while in the feed. */
const KEEP_NOT_RECIPES_MS = 120 * 24 * 60 * 60_000

/** The small photo kept of each. */
const PHOTO = { width: 640, height: 480, quality: 72 }

/** The words sites use in their categories for each of Merran's courses. */
const COURSE_WORDS: Record<Course, string[]> = {
  main: [
    "main",
    "mains",
    "main course",
    "main dish",
    "dinner",
    "entree",
    "entrée",
    "supper",
  ],
  side: ["side", "sides", "side dish"],
  soup: ["soup", "soups", "stew", "stews"],
  salad: ["salad", "salads"],
  dessert: ["dessert", "desserts", "sweets", "sweet treats"],
  baking: [
    "baking",
    "baked goods",
    "bread",
    "breads",
    "cake",
    "cakes",
    "muffins",
    "cookies",
    "pies",
  ],
  breakfast: ["breakfast", "brunch"],
  snack: [
    "snack",
    "snacks",
    "appetizer",
    "appetizers",
    "starter",
    "starters",
    "finger food",
  ],
  drink: [
    "drink",
    "drinks",
    "beverage",
    "beverages",
    "cocktail",
    "cocktails",
    "smoothie",
  ],
  sauce: ["sauce", "sauces", "condiment", "condiments", "dressing", "dip"],
}

const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** A pattern for whole words, plurals too: "cookie" finds "Cookies". */
export function wordPattern(words: readonly string[]) {
  const alternatives = words
    .map((word) => escape(word.toLowerCase()).replace(/\s+/g, "[\\s-]+"))
    .join("|")
  return new RegExp(`(^|[^\\p{L}])(${alternatives})(e?s)?($|[^\\p{L}])`, "iu")
}

const COURSE_PATTERNS = COURSES.map(
  (course) => [course, wordPattern(COURSE_WORDS[course])] as const
)

/** Merran's courses for a recipe's categories: "Main Course" is "main". */
export function coursesOf(categories: readonly string[]): Course[] {
  return COURSE_PATTERNS.filter(([, pattern]) =>
    categories.some((category) => pattern.test(category))
  ).map(([course]) => course)
}

/** What the shelf keeps of a recipe page's recipe data. */
export function shelfFields(data: RecipeData) {
  const input = data.input
  const about = data.about ?? { categories: [], cuisines: [], keywords: [] }
  const minutes =
    input.totalMinutes ??
    ((input.prepMinutes ?? 0) + (input.cookMinutes ?? 0) || null)
  return {
    name: input.name,
    description: input.description?.slice(0, 400) ?? null,
    minutes,
    photoUrl: data.photoUrls[0] ?? null,
    courses: coursesOf(about.categories),
    keywords: [
      ...new Set([...about.categories, ...about.cuisines, ...about.keywords]),
    ],
    ingredients: input.ingredients,
    diets: dietsFor(input.ingredients),
  }
}

type Opened =
  | { kind: "recipe"; url: string; fields: ReturnType<typeof shelfFields> }
  | { kind: "not-recipe" }
  /** The site turned Merran away (403 or 429): leave it be for a while. */
  | { kind: "refused" }
  /** robots.txt says not to. */
  | { kind: "kept-out" }
  | { kind: "failed" }

/** Opens a recipe page in the background, as robots.txt allows. */
export async function openPage(fetcher: Fetcher, url: string): Promise<Opened> {
  try {
    if (isVideoLink(url)) return { kind: "not-recipe" }
    if (!(await allowedByRobots(fetcher, url))) return { kind: "kept-out" }
    const page = await fetcher(url)
    const pageUrl = normalizeLink(page.url)
    const data = readRecipeData(
      decodeHtml(page.body, page.contentType),
      pageUrl
    )
    if (!data) return { kind: "not-recipe" }
    return { kind: "recipe", url: pageUrl, fields: shelfFields(data) }
  } catch (err) {
    if (err instanceof AppError && err.code === "site_refused") {
      return { kind: "refused" }
    }
    return { kind: "failed" }
  }
}

/** Saves what opening a page found. A refused page is tried again later. */
export function applyOpened(row: SiteRecipe, opened: Opened) {
  row.openedAt = new Date()
  switch (opened.kind) {
    case "recipe":
      Object.assign(row, opened.fields)
      row.state = "recipe"
      row.failures = 0
      return
    case "not-recipe":
      row.state = "not-recipe"
      row.failures = 0
      return
    case "kept-out":
      row.state = "failed"
      row.failures = MOST_FAILURES
      return
    case "refused":
    case "failed":
      row.failures += 1
      // A recipe that opened before stays until it's failed a few times.
      if (row.failures >= MOST_FAILURES) row.state = "failed"
      return
  }
}

/** Waits, unless the job's been stopped. */
export function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason)
    const timer = setTimeout(done, ms)
    function done() {
      signal.removeEventListener("abort", stop)
      resolve()
    }
    function stop() {
      clearTimeout(timer)
      reject(signal.reason)
    }
    signal.addEventListener("abort", stop, { once: true })
  })
}

/** How long to wait between one site's pages. */
export async function pauseFor(fetcher: Fetcher, url: string) {
  const robots = await robotsFor(fetcher, url)
  return (
    Math.min(
      Math.max(PACE.seconds, robots.crawlDelay ?? 0),
      MOST_PAUSE_SECONDS
    ) * 1000
  )
}

const ACCEPT_FEED =
  "application/rss+xml,application/atom+xml,application/xml;q=0.9,text/xml;q=0.9,*/*;q=0.5"

/** Reads a site's feed, adding new posts to open. Says why not, if it can't. */
async function readFeed(deps: ShelfDeps, em: EntityManager, site: RecipeSite) {
  if (!(await allowedByRobots(deps.fetcher, site.feedUrl))) {
    return "This site's robots.txt asks Merran not to read its feed."
  }
  let answer
  try {
    answer = await deps.fetcher(site.feedUrl, {
      accept: ACCEPT_FEED,
      keepErrors: true,
      headers: {
        ...(site.etag ? { "if-none-match": site.etag } : {}),
        ...(site.lastModified
          ? { "if-modified-since": site.lastModified }
          : {}),
      },
    })
  } catch (err) {
    return err instanceof AppError ? err.message : "Couldn't reach that site."
  }
  if (answer.status === 304) return null
  if (answer.status === 403 || answer.status === 429) {
    return "That site turned Merran away."
  }
  if (answer.status >= 400) {
    return `That site's feed answered with an error (${answer.status}).`
  }
  const body = decodeHtml(answer.body, answer.contentType)
  if (!looksLikeFeed(body, answer.contentType)) {
    return "That site's feed isn't a feed any more."
  }
  const feed = parseFeed(body, answer.url)

  const items = feed.items.flatMap((item) => {
    try {
      return [{ ...item, url: normalizeLink(item.url) }]
    } catch {
      return []
    }
  })
  const known = new Set(
    (
      await em.find(
        SiteRecipe,
        { url: { $in: items.map((item) => item.url) } },
        { fields: ["url"] }
      )
    ).map((row) => row.url)
  )
  for (const item of items) {
    if (known.has(item.url)) continue
    known.add(item.url)
    em.create(SiteRecipe, {
      site,
      url: item.url,
      state: "waiting",
      siteName: site.name,
      name: item.title?.slice(0, 300) ?? null,
      photoUrl: item.photoUrl,
      courses: [],
      keywords: [],
      ingredients: [],
      diets: [],
      publishedAt: item.publishedAt,
    })
  }
  site.etag = answer.etag ?? null
  site.lastModified = answer.lastModified ?? null
  await em.flush()
  return null
}

/**
 * Reads a site: its feed, then its new posts, one at a time, a few seconds
 * apart. Sooner again while there are posts still to open.
 */
export async function readSite(
  deps: ShelfDeps,
  em: EntityManager,
  site: RecipeSite,
  signal: AbortSignal
) {
  const error = await readFeed(deps, em, site)
  site.readAt = new Date()
  site.error = error

  let refused = false
  const waiting = await em.find(
    SiteRecipe,
    { site, state: "waiting" },
    {
      orderBy: { publishedAt: "desc", createdAt: "desc" },
      limit: OPEN_EACH_READ,
    }
  )
  const gap = waiting.length > 0 ? await pauseFor(deps.fetcher, site.url) : 0
  for (const [index, row] of waiting.entries()) {
    if (index > 0) await pause(gap, signal)
    const opened = await openPage(deps.fetcher, row.url)
    if (opened.kind === "refused") {
      refused = true
      break
    }
    applyOpened(row, opened)
    // Feeds sometimes give one post at two addresses.
    if (opened.kind === "recipe" && opened.url !== row.url) {
      const other = await em.findOne(SiteRecipe, { url: opened.url })
      if (!other) row.url = opened.url
    }
    await em.flush()
  }

  const left = await em.count(SiteRecipe, { site, state: "waiting" })
  site.nextReadAt = new Date(
    Date.now() + (refused || left > 0 ? SOON_MS : READ_EVERY_MS)
  )
  await em.flush()
  await prune(deps, em, site)
}

/** Keeps each site's newest recipes, and forgets old posts that weren't. */
async function prune(deps: ShelfDeps, em: EntityManager, site: RecipeSite) {
  const old = await em.find(
    SiteRecipe,
    { site, state: "recipe", classic: false },
    {
      orderBy: { publishedAt: "desc", createdAt: "desc" },
      offset: KEEP_PER_SITE,
      fields: ["id", "photo"],
    }
  )
  const stale = await em.find(
    SiteRecipe,
    {
      site,
      state: { $in: ["not-recipe", "failed"] satisfies SiteRecipeState[] },
      classic: false,
      createdAt: { $lt: new Date(Date.now() - KEEP_NOT_RECIPES_MS) },
    },
    { fields: ["id", "photo"] }
  )
  if (old.length + stale.length === 0) return
  for (const row of [...old, ...stale]) {
    if (row.photo) await deps.files.remove(photoKey(row.photo))
  }
  await em.remove([...old, ...stale]).flush()
}

const photoKey = (photo: string) => `site-photos/${photo}.webp`

/**
 * A shelf recipe's photo, small, as WebP: fetched once, with its page as
 * the referer, then kept. Null when it has none, or it won't load.
 */
export async function shelfPhoto(
  deps: ShelfDeps,
  em: EntityManager,
  row: SiteRecipe
): Promise<Buffer | null> {
  if (row.photo) return deps.files.read(photoKey(row.photo))
  if (row.photo === "" || !row.photoUrl) return null
  try {
    const answer = await deps.fetcher(row.photoUrl, {
      accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      maxBytes: 15_000_000,
      referer: row.url,
    })
    const body = await sharp(answer.body, { failOn: "error" })
      .rotate()
      .resize({ ...PHOTO, fit: "cover" })
      .webp({ quality: PHOTO.quality })
      .toBuffer()
    const photo = randomBytes(12).toString("hex")
    await deps.files.put(photoKey(photo), body)
    row.photo = photo
    await em.flush()
    return body
  } catch {
    row.photo = ""
    await em.flush()
    return null
  }
}

import type { EntityManager } from "@mikro-orm/sql"
import { z } from "zod"
import {
  FollowedSite,
  RecipeSite,
  SiteRecipe,
} from "../../database/entities/index.ts"
import { ACROSS_HOUSEHOLDS } from "../../database/scope.ts"
import { SITES } from "../../modules/sites/settings.ts"
import type { JobHandler } from "../jobs/runner.ts"
import { allClassics, allSuggestedSites } from "./data.ts"
import {
  applyOpened,
  openPage,
  pause,
  pauseFor,
  readSite,
  type ShelfDeps,
} from "./shelf.ts"

// The job that keeps the shelf current: every half hour it reads the sites
// that are due (suggested, or followed by a household), and opens the
// collections' classics that are new or a week since they were checked.
// Following a site reads it straight away, with the site in the payload.

export const READ_SITES = "sites.read"

/** The read a minute after start; a site's own read has its id in the key. */
export const READ_NOW_KEY = `${READ_SITES}:now`

/** Sites, or the classics' sites, read at once. */
const AT_ONCE = 3

/** A classic is opened again after this long; sooner when it wouldn't open. */
const CHECK_CLASSICS_EVERY_MS = 7 * 24 * 60 * 60_000
const RETRY_CLASSICS_MS = 24 * 60 * 60_000

/** Classics opened in one go, so a run doesn't go on for an hour. */
const CLASSICS_EACH_RUN = 100

/** Runs `work` on each, a few at a time. */
async function inTurn<T>(
  items: readonly T[],
  work: (item: T) => Promise<void>
) {
  const queue = [...items]
  await Promise.all(
    Array.from({ length: Math.min(AT_ONCE, queue.length) }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
        await work(item)
      }
    })
  )
}

/** Makes sure every suggested site and classic has its row. */
async function addFromData(em: EntityManager) {
  const suggested = allSuggestedSites()
  const haveSites = new Set(
    (
      await em.find(
        RecipeSite,
        { feedUrl: { $in: suggested.map((site) => site.feedUrl) } },
        { fields: ["feedUrl"] }
      )
    ).map((site) => site.feedUrl)
  )
  for (const site of suggested) {
    if (haveSites.has(site.feedUrl)) continue
    em.create(RecipeSite, {
      name: site.name,
      url: site.url,
      feedUrl: site.feedUrl,
      language: site.language,
    })
  }

  const classics = allClassics()
  const have = new Map(
    (
      await em.find(SiteRecipe, {
        url: { $in: classics.map((classic) => classic.url) },
      })
    ).map((row) => [row.url, row])
  )
  for (const classic of classics) {
    const row = have.get(classic.url)
    if (row) {
      row.classic = true
      continue
    }
    em.create(SiteRecipe, {
      url: classic.url,
      state: "waiting",
      siteName: classic.site,
      courses: [],
      keywords: [],
      ingredients: [],
      diets: [],
      classic: true,
    })
  }
  await em.flush()
}

/** The sites due a read: suggested, or followed by anyone. */
async function dueSites(em: EntityManager) {
  const followed = await em.find(
    FollowedSite,
    {},
    {
      ...ACROSS_HOUSEHOLDS,
      fields: ["site"],
    }
  )
  const ids = [...new Set(followed.map((row) => row.site.id))]
  const suggested = allSuggestedSites().map((site) => site.feedUrl)
  return em.find(
    RecipeSite,
    {
      nextReadAt: { $lte: new Date() },
      $or: [{ id: { $in: ids } }, { feedUrl: { $in: suggested } }],
    },
    { orderBy: { nextReadAt: "asc" } }
  )
}

/**
 * Opens the classics that are new, or a week since they were last opened,
 * one site at a time each, a few seconds apart.
 */
async function checkClassics(
  deps: ShelfDeps,
  em: EntityManager,
  signal: AbortSignal
) {
  const due = await em.find(
    SiteRecipe,
    {
      classic: true,
      $or: [
        { openedAt: null },
        { openedAt: { $lt: new Date(Date.now() - CHECK_CLASSICS_EVERY_MS) } },
        {
          failures: { $gt: 0 },
          openedAt: { $lt: new Date(Date.now() - RETRY_CLASSICS_MS) },
        },
      ],
    },
    { orderBy: { openedAt: "asc" }, limit: CLASSICS_EACH_RUN }
  )
  const byHost = new Map<string, string[]>()
  for (const row of due) {
    const host = new URL(row.url).host
    byHost.set(host, [...(byHost.get(host) ?? []), row.id])
  }
  await inTurn([...byHost.values()], async (ids) => {
    // Each site's classics in their own entity manager, as they go at once.
    const own = em.fork()
    const rows = await own.find(
      SiteRecipe,
      { id: { $in: ids } },
      { orderBy: { openedAt: "asc" } }
    )
    const gap = await pauseFor(deps.fetcher, rows[0]!.url)
    for (const [index, row] of rows.entries()) {
      if (index > 0) await pause(gap, signal)
      const opened = await openPage(deps.fetcher, row.url)
      // A classic keeps the address it's listed under, to match it again.
      applyOpened(row, opened)
      await own.flush()
      if (opened.kind === "refused") break
    }
  })
}

const Payload = z.object({ siteId: z.string().optional() })

export const readSitesJob: JobHandler = {
  kind: READ_SITES,
  concurrency: 2,
  async run({ em, payload, deps, signal, logger }) {
    if (!(await deps.settings.server(SITES.enabled))) return { off: true }
    const { siteId } = Payload.parse(payload)

    // Someone just followed it: read it now.
    if (siteId) {
      const site = await em.findOne(RecipeSite, { id: siteId })
      if (site) await readSite(deps, em, site, signal)
      return { sites: site ? 1 : 0 }
    }

    await addFromData(em)
    const sites = await dueSites(em)
    let failed = 0
    await inTurn(sites, async (site) => {
      try {
        // Each site on its own, so one's trouble doesn't stop the rest.
        const own = em.fork()
        const found = await own.findOneOrFail(RecipeSite, { id: site.id })
        await readSite(deps, own, found, signal)
      } catch (err) {
        if (signal.aborted) throw err
        failed += 1
        logger.warn({ err, site: site.feedUrl }, "Couldn't read a recipe site")
      }
    })
    await checkClassics(deps, em, signal)
    return { sites: sites.length, failed }
  },
}

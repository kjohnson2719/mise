import type { EntityManager } from "@mikro-orm/sql"
import { z } from "zod"
import { AppError } from "../../../core/errors.ts"
import { Job, Recipe } from "../../../database/entities/index.ts"
import { ACTIVE, enqueue, findJob } from "../../jobs/jobs.ts"
import { JobStopped, type JobHandler } from "../../jobs/runner.ts"
import { findLinks } from "../../share/links.ts"
import { inHouseholdTransaction } from "../recipes.ts"
import { addTagsTo } from "../tags.ts"
import { importLink } from "./import-link.ts"
import { findBySourceUrl, isVideoLink, normalizeLink } from "./links.ts"

// Several links at once, pasted from a note or shared together: checked
// against the library, then imported one at a time as a job, which says how
// each link went as it goes.

const KIND = "recipes.importLinks"

/** The most links one import takes. */
export const MAX_LINKS = 100

/** Where each link has got to. "stopped" is only ever shown, never kept. */
export type LinkState =
  "waiting" | "adding" | "added" | "already" | "failed" | "stopped"

export type LinkItem = {
  url: string
  state: LinkState
  /** The recipe it made, or was already. */
  recipe: {
    id: string
    slug: string
    name: string
    photo: string | null
  } | null
  /** Why it wasn't added. */
  error: string | null
}

const Payload = z.object({
  urls: z.array(z.string()).max(MAX_LINKS),
  tag: z.string().nullable(),
  userId: z.string().nullable(),
})

const SoFar = z.object({
  tag: z.string().nullable(),
  items: z.array(
    z.object({
      url: z.string(),
      state: z.enum(["waiting", "adding", "added", "already", "failed"]),
      recipe: z
        .object({
          id: z.string(),
          slug: z.string(),
          name: z.string(),
          photo: z.string().nullable(),
        })
        .nullable(),
      error: z.string().nullable(),
    })
  ),
})

const waiting = (url: string): LinkItem => ({
  url,
  state: "waiting",
  recipe: null,
  error: null,
})

/** A link as Merran keeps it, or null if it isn't one it can fetch. */
function tidy(raw: string) {
  try {
    return normalizeLink(raw)
  } catch {
    return null
  }
}

/** The links in some pasted text, and which are in the library already. */
export async function checkLinks(em: EntityManager, text: string) {
  const found = findLinks(text)
  const links: {
    url: string
    video: boolean
    existing: { slug: string; name: string } | null
  }[] = []
  for (const raw of found) {
    if (links.length === MAX_LINKS) break
    const url = tidy(raw)
    if (!url || links.some((link) => link.url === url)) continue
    const existing = await findBySourceUrl(em, [url])
    links.push({
      url,
      video: isVideoLink(url),
      existing: existing ? { slug: existing.slug, name: existing.name } : null,
    })
  }
  return { links, more: Math.max(0, found.length - MAX_LINKS) }
}

/** Starts importing several links, in the background. */
export async function startLinkImport(
  em: EntityManager,
  options: {
    householdId: string
    userId: string
    urls: readonly string[]
    /** Added to every recipe it makes, like "to try". */
    tag?: string | null
  }
) {
  const urls = [
    ...new Set(
      options.urls.map(tidy).filter((url): url is string => url !== null)
    ),
  ].slice(0, MAX_LINKS)
  if (urls.length === 0) {
    throw new AppError("invalid", "no_links", "Add at least one link.", {
      urls: "Add at least one link.",
    })
  }
  const tag = options.tag?.trim() || null
  return enqueue(em, {
    kind: KIND,
    householdId: options.householdId,
    payload: { urls, tag, userId: options.userId },
    createdBy: options.userId,
    // Never tried again by itself: Try again starts another with the ones left.
    maxAttempts: 1,
    // Each link shows at once, waiting.
    result: { tag, items: urls.map(waiting) },
  })
}

/** An import as the API shows it. */
export function describeLinkImport(job: Job) {
  const kept = SoFar.safeParse(job.result)
  const payload = Payload.safeParse(job.payload)
  const tag = kept.data?.tag ?? payload.data?.tag ?? null
  const finished = !(ACTIVE as readonly string[]).includes(job.status)
  const items: LinkItem[] = (
    kept.data?.items ?? (payload.data?.urls ?? []).map(waiting)
  ).map((item) =>
    // Ones it never got to, when it's stopped.
    finished && (item.state === "waiting" || item.state === "adding")
      ? { ...item, state: "stopped" as const }
      : item
  )
  const count = (state: LinkState) =>
    items.filter((item) => item.state === state).length
  return {
    id: job.id,
    status: job.status,
    tag,
    total: items.length,
    done: items.length - count("waiting") - count("adding"),
    added: count("added"),
    already: count("already"),
    failed: count("failed"),
    stopped: count("stopped"),
    items,
    createdAt: job.createdAt.toISOString(),
    finishedAt: job.finishedAt?.toISOString() ?? null,
  }
}

/** One of the household's link imports. */
export async function findLinkImport(
  em: EntityManager,
  importId: string,
  householdId: string
) {
  const job = await findJob(em, importId, householdId).catch((err) => {
    if (err instanceof AppError) return null
    throw err
  })
  if (!job || job.kind !== KIND) {
    throw new AppError(
      "not_found",
      "import_not_found",
      "There's no such import."
    )
  }
  return job
}

/** The household's link imports still going, newest first. */
export async function activeLinkImports(
  em: EntityManager,
  householdId: string
) {
  const jobs = await em.find(
    Job,
    { kind: KIND, forHousehold: householdId, status: { $in: [...ACTIVE] } },
    { orderBy: { createdAt: "desc" } }
  )
  return jobs.map(describeLinkImport)
}

/** Tags a recipe the import made. */
function tagRecipe(
  em: EntityManager,
  householdId: string,
  recipeId: string,
  tag: string
) {
  return inHouseholdTransaction(em, householdId, async (tx) => {
    const recipe = await tx.findOneOrFail(Recipe, { id: recipeId })
    await addTagsTo(tx, householdId, [recipe], [tag])
  })
}

/**
 * The import job: each link in turn, so what's in stays in if it's
 * stopped. A link the library has already is noted, not added again.
 */
export const linkImportJob: JobHandler = {
  kind: KIND,
  concurrency: 2,
  async run({
    jobId,
    em,
    householdId,
    payload,
    progress,
    signal,
    logger,
    deps,
  }) {
    if (!householdId) throw new Error("An import needs a household.")
    const { urls, tag, userId } = Payload.parse(payload)
    const items = urls.map(waiting)
    const soFar = () => ({ tag, items })
    let done = 0

    try {
      for (const item of items) {
        if (signal.aborted) throw new JobStopped()
        item.state = "adding"
        await progress(done, items.length, soFar())
        try {
          const { recipe, duplicate } = await importLink(em, deps, {
            householdId,
            userId,
            url: item.url,
          })
          if (!duplicate && tag) {
            await tagRecipe(em, householdId, recipe.id, tag)
          }
          item.state = duplicate ? "already" : "added"
          item.recipe = {
            id: recipe.id,
            slug: recipe.slug,
            name: recipe.name,
            photo: recipe.photo?.card ?? null,
          }
        } catch (err) {
          item.state = "failed"
          item.error =
            err instanceof AppError
              ? err.message
              : "Something went wrong with it."
          if (!(err instanceof AppError)) {
            logger.warn({ err, url: item.url }, "A link didn't come in")
          }
        }
        done++
        await progress(done, items.length, soFar())
      }
      return soFar()
    } catch (err) {
      // Stopped: what it got through is kept, and the rest stay waiting.
      for (const item of items) {
        if (item.state === "adding") item.state = "waiting"
      }
      await deps.database.em
        .fork()
        .nativeUpdate(
          Job,
          { id: jobId },
          { progress: { done, total: items.length }, result: soFar() }
        )
      throw err
    }
  },
}

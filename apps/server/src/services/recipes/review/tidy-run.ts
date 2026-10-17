import type { EntityManager } from "@mikro-orm/sql"
import { z } from "zod"
import { AppError } from "../../../core/errors.ts"
import { Household, Job, Recipe } from "../../../database/entities/index.ts"
import { forHousehold, HOUSEHOLD_FILTER } from "../../../database/scope.ts"
import { ACTIVE, enqueue } from "../../jobs/jobs.ts"
import { JobStopped, type JobHandler } from "../../jobs/runner.ts"
import { proposeTidy } from "./tidy.ts"

// Tidying many recipes in the background: the household's whole library
// (every recipe not tidied yet, say after moving from Mealie), the ones
// picked on the Recipes page, or a recipe just imported when the household
// tidies new recipes by itself. Suggestions arrive in the Review queue.

const KIND = "recipes.tidy"

/** The most recipes picked to tidy at once. */
export const MAX_PICKED = 200

/** It stops after this many recipes in a row can't be tidied. */
const FAILURES_IN_A_ROW = 3

const Payload = z.object({
  /** The recipes picked, or null for every one not tidied yet. */
  ids: z.array(z.string()).nullable(),
  userId: z.string().nullable(),
  /** After an import, by itself: not shown as a run. */
  auto: z.boolean().default(false),
})

const Counts = z.object({
  total: z.number(),
  done: z.number(),
  /** Recipes with suggestions waiting in Review. */
  suggested: z.number(),
  /** Recipes it found nothing to change in. */
  fine: z.number(),
  failed: z.number(),
  /** Why it stopped before the end, when it did. */
  stopped: z.string().nullable(),
})
type Counts = z.infer<typeof Counts>

const counting = (total: number): Counts => ({
  total,
  done: 0,
  suggested: 0,
  fine: 0,
  failed: 0,
  stopped: null,
})

/**
 * No AI, none left this month, or no credit: the rest would fail the same
 * way, so the run stops and says why.
 */
const stopsTheRun = (err: unknown) =>
  err instanceof AppError &&
  (err.kind === "forbidden" ||
    err.kind === "rate_limited" ||
    err.code === "ai_out_of_credit")

export const tidyRunJob: JobHandler = {
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
    if (!householdId) throw new Error("Tidying needs a household.")
    const { ids, userId } = Payload.parse(payload)
    const recipes = await em.find(
      Recipe,
      ids ? { id: { $in: ids } } : { tidiedAt: null },
      { fields: ["id"], orderBy: { createdAt: "asc", id: "asc" } }
    )
    const counts = counting(recipes.length)
    await progress(0, counts.total, counts)
    let inARow = 0

    for (const { id } of recipes) {
      if (signal.aborted) throw new JobStopped()
      try {
        // A fresh view for each, so a long run doesn't hold every recipe.
        const proposal = await proposeTidy(
          deps,
          forHousehold(deps.database.em, householdId),
          { householdId, userId, recipe: id, jobId }
        )
        if (proposal) counts.suggested++
        else counts.fine++
        inARow = 0
      } catch (err) {
        counts.failed++
        inARow++
        if (stopsTheRun(err)) {
          counts.stopped = (err as AppError).message
          break
        }
        if (!(err instanceof AppError)) {
          logger.warn({ err, recipe: id }, "A recipe couldn't be tidied")
        }
        if (inARow >= FAILURES_IN_A_ROW) {
          counts.stopped =
            err instanceof AppError
              ? err.message
              : "Three recipes in a row couldn't be tidied."
          break
        }
      }
      counts.done++
      await progress(counts.done, counts.total, counts)
    }
    await progress(counts.done, counts.total, counts)
    // Open pages show what it suggested.
    if (counts.suggested > 0) {
      deps.events.changed(householdId, {
        area: "recipes",
        by: null,
        client: null,
      })
    }
    return counts
  },
}

/**
 * Starts tidying recipes: the ones picked, or every one not tidied yet.
 * One run of the whole library at a time; starting another gives back the
 * one going.
 */
export async function startTidyRun(
  em: EntityManager,
  options: {
    householdId: string
    userId: string | null
    /** The recipes picked; none for every one not tidied yet. */
    ids?: readonly string[] | null
    auto?: boolean
  }
) {
  const ids = options.ids
    ? [...new Set(options.ids)].slice(0, MAX_PICKED)
    : null
  const total = ids
    ? await em.count(Recipe, { id: { $in: ids } })
    : await em.count(Recipe, { tidiedAt: null })
  if (total === 0) {
    throw ids
      ? new AppError("invalid", "no_recipes", "Pick some recipes to tidy up.")
      : new AppError(
          "invalid",
          "all_tidied",
          "Every recipe has been tidied up already."
        )
  }
  return enqueue(em, {
    kind: KIND,
    householdId: options.householdId,
    payload: { ids, userId: options.userId, auto: options.auto ?? false },
    createdBy: options.userId,
    // The whole library, once at a time.
    ...(ids ? {} : { key: `tidy:${options.householdId}` }),
    // A failed run isn't tried again by itself: what it did stays done.
    maxAttempts: 1,
    result: counting(total),
  })
}

/**
 * Tidies a recipe just imported in the background, when the household
 * tidies new recipes by itself. Never fails the import.
 */
export async function tidyAfterImport(
  em: EntityManager,
  options: { householdId: string; userId: string | null; recipeId: string }
) {
  try {
    const household = await em.findOne(
      Household,
      { id: options.householdId },
      { filters: { [HOUSEHOLD_FILTER]: false } }
    )
    if (!household?.settings?.ai?.autoTidy) return
    await startTidyRun(em, {
      householdId: options.householdId,
      userId: options.userId,
      ids: [options.recipeId],
      auto: true,
    })
  } catch {
    // Tidying is a nicety; the recipe's in either way.
  }
}

/** A run as the API shows it. */
export function describeTidyRun(job: Job) {
  const payload = Payload.safeParse(job.payload)
  const counts = Counts.safeParse(job.result)
  return {
    id: job.id,
    status: job.status,
    /** Every recipe not tidied yet, rather than ones picked. */
    library: payload.success ? payload.data.ids === null : false,
    ...(counts.success ? counts.data : counting(0)),
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
  }
}

/** How long a finished run is still shown, with what it found. */
const SHOWN_FOR = 24 * 60 * 60 * 1000

/**
 * The household's runs to show: going, or finished in the last day, newest
 * first. Not the ones that tidy an import by itself.
 */
export async function tidyRuns(em: EntityManager, householdId: string) {
  const jobs = await em.find(
    Job,
    {
      kind: KIND,
      forHousehold: householdId,
      $or: [
        { status: { $in: [...ACTIVE] } },
        { finishedAt: { $gte: new Date(Date.now() - SHOWN_FOR) } },
      ],
    },
    { orderBy: { createdAt: "desc" }, limit: 10 }
  )
  return jobs
    .filter((job) => !Payload.safeParse(job.payload).data?.auto)
    .map(describeTidyRun)
}

/** How many of the household's recipes tidy up hasn't looked at. */
export const untidiedCount = (em: EntityManager) =>
  em.count(Recipe, { tidiedAt: null })

/** One of the household's runs. */
export async function findTidyRun(
  em: EntityManager,
  runId: string,
  householdId: string
) {
  const job = /^[0-9a-f-]{36}$/i.test(runId)
    ? await em.findOne(Job, {
        id: runId,
        kind: KIND,
        forHousehold: householdId,
      })
    : null
  if (!job) {
    throw new AppError("not_found", "run_not_found", "There's no such run.")
  }
  return job
}

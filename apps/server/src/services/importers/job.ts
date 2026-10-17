import { rm } from "node:fs/promises"
import type { EntityManager } from "@mikro-orm/sql"
import { z, ZodError } from "zod"
import { AppError } from "../../core/errors.ts"
import { Job, Recipe } from "../../database/entities/index.ts"
import { NOT_DELETED_FILTER } from "../../database/scope.ts"
import { RecipeInputSchema } from "../../http/schemas/recipes.ts"
import { membersByEmail } from "../households.ts"
import { enqueue } from "../jobs/jobs.ts"
import { JobStopped, type JobDeps, type JobHandler } from "../jobs/runner.ts"
import { removePhoto, storePhoto } from "../recipes/photos.ts"
import { importRecipe } from "../recipes/recipes.ts"
import type { Sealed } from "../secrets/secret-box.ts"
import { openUpload } from "./files.ts"
import { openMealieServer } from "./mealie/server.ts"
import type { AppSource } from "./types.ts"

// The import job for other apps: whichever app the recipes come from, they
// come in here, one at a time. A recipe already brought in (importing the
// same thing twice) is skipped, and one that won't come in is noted and
// passed over rather than stopping the rest.

const KIND = "recipes.importFromApp"

/** How many recipes that didn't come in are named in the result. */
const NAMED_FAILURES = 50

const SealedSchema = z.object({
  keyId: z.string(),
  dataKey: z.string(),
  value: z.string(),
})

const Payload = z.discriminatedUnion("from", [
  z.object({
    from: z.literal("file"),
    /** The upload, on disk. */
    file: z.string(),
    /** A Mealie backup's group, or null for all of them. */
    group: z.string().nullable(),
    userId: z.string().nullable(),
  }),
  z.object({
    from: z.literal("mealie"),
    url: z.string(),
    /** Sealed while the import runs, and forgotten once it's finished. */
    token: SealedSchema.nullable(),
    userId: z.string().nullable(),
  }),
])
type Payload = z.infer<typeof Payload>

export type AppImport =
  | { from: "file"; file: string; group: string | null }
  | { from: "mealie"; url: string; token: Sealed }

/** Starts bringing recipes in from another app, in the background. */
export function startAppImport(
  em: EntityManager,
  options: {
    householdId: string
    userId: string
    source: AppImport
    /** The same file started twice runs once. */
    key?: string
  }
) {
  return enqueue(em, {
    kind: KIND,
    key: options.key,
    householdId: options.householdId,
    payload: { ...options.source, userId: options.userId },
    createdBy: options.userId,
    // Never tried again by itself: Try again starts over, skipping what's in.
    maxAttempts: 1,
  })
}

/** Which of these are here already, Recently deleted included. */
export async function alreadyHere(em: EntityManager, refs: readonly string[]) {
  let count = 0
  for (let start = 0; start < refs.length; start += 500) {
    count += await em.count(
      Recipe,
      { importedFrom: { $in: refs.slice(start, start + 500) } },
      { filters: { [NOT_DELETED_FILTER]: false } }
    )
  }
  return count
}

/** Recipes from a Mealie, imported here before by any of the ways in. */
export function alreadyFromMealie(em: EntityManager) {
  return em.count(
    Recipe,
    { importedFrom: { $like: "mealie:%" } },
    { filters: { [NOT_DELETED_FILTER]: false } }
  )
}

/** Something to say about a recipe that didn't come in. */
function whyNot(err: unknown) {
  if (err instanceof ZodError) {
    const issue = err.issues[0]
    return issue
      ? `${issue.path.join(".") || "recipe"}: ${issue.message}`
      : "It isn't a recipe Merran can take."
  }
  if (err instanceof AppError) return err.message
  return "Something went wrong with it."
}

async function bringIn(
  em: EntityManager,
  deps: JobDeps,
  householdId: string,
  source: AppSource,
  {
    progress,
    signal,
    logger,
  }: Pick<Parameters<JobHandler["run"]>[0], "progress" | "signal" | "logger">
) {
  const userOf = await membersByEmail(em, householdId)
  let done = 0
  let added = 0
  let skipped = 0
  let photos = 0
  const failed: { name: string; error: string }[] = []
  let failures = 0

  await progress(0, source.total)
  for await (const recipe of source.recipes()) {
    if (signal.aborted) throw new JobStopped()
    done++
    const here = await em.count(
      Recipe,
      { importedFrom: recipe.ref },
      { filters: { [NOT_DELETED_FILTER]: false } }
    )
    if (here > 0) {
      skipped++
    } else {
      let photoId: string | null = null
      try {
        const body = await recipe.read()
        const input = RecipeInputSchema.parse(body.input)
        const photo = await body.photo().catch(() => null)
        if (photo) {
          photoId = await storePhoto(deps.files, householdId, photo).catch(
            () => null
          )
        }
        const createdAt = body.createdAt ?? new Date()
        await importRecipe(em, {
          householdId,
          id: null,
          slug: input.name,
          input,
          origin: source.app,
          importedFrom: recipe.ref,
          photoId,
          createdBy: userOf(body.createdBy),
          lastMadeAt: body.lastMadeAt,
          nutrition: body.nutrition,
          dietOverrides: {},
          createdAt,
          updatedAt: body.updatedAt ?? createdAt,
          versions: [],
          cookNotes: body.cookNotes.map((note) => ({
            rating: null,
            note: note.note,
            createdAt: note.createdAt,
            user: userOf(note.by),
          })),
        })
        added++
        if (photoId) photos++
      } catch (err) {
        await removePhoto(deps.files, householdId, photoId).catch(() => {})
        if (signal.aborted) throw err
        logger.warn({ err, ref: recipe.ref }, "A recipe didn't come in")
        failures++
        if (failed.length < NAMED_FAILURES) {
          failed.push({
            name: recipe.name.slice(0, 200) || recipe.ref,
            error: whyNot(err),
          })
        }
      }
    }
    await progress(done, Math.max(done, source.total))
  }
  return { recipes: added, photos, skipped, failed: failures, failures: failed }
}

const tokenGone = () =>
  new AppError(
    "invalid",
    "mealie_token_gone",
    "Mealie's token isn't kept once an import has finished. Start the import again from Settings."
  )

/** Merran is shutting down, so the job runs again next start. */
const shuttingDown = (signal: AbortSignal) =>
  signal.aborted &&
  signal.reason instanceof JobStopped &&
  signal.reason.why === "shutdown"

async function forgetToken(deps: JobDeps, jobId: string, payload: Payload) {
  await deps.database.em
    .fork()
    .nativeUpdate(Job, { id: jobId }, { payload: { ...payload, token: null } })
}

export const appImportJob: JobHandler = {
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
    const job = Payload.parse(payload)
    try {
      let source: AppSource
      if (job.from === "file") {
        source = await openUpload(job.file, {
          group: job.group,
          fetcher: deps.fetcher,
        })
      } else {
        if (!job.token) throw tokenGone()
        source = await openMealieServer(
          deps.fetcher,
          job.url,
          deps.settings.open(job.token)
        )
      }
      try {
        const result = await bringIn(em, deps, householdId, source, {
          progress,
          signal,
          logger,
        })
        if (job.from === "file") {
          // Done with: an upload that failed stays for Try again, a week at most.
          source.close()
          await rm(job.file, { force: true })
        }
        return result
      } finally {
        source.close()
      }
    } finally {
      if (job.from === "mealie" && job.token && !shuttingDown(signal)) {
        await forgetToken(deps, jobId, job)
      }
    }
  },
}

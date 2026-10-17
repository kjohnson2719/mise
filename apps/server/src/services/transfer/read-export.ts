import { randomUUID } from "node:crypto"
import { createWriteStream } from "node:fs"
import { mkdir, readdir, rm, stat } from "node:fs/promises"
import { join } from "node:path"
import { Readable, Transform } from "node:stream"
import { pipeline } from "node:stream/promises"
import type { z } from "zod"
import { AppError } from "../../core/errors.ts"
import {
  EXPORT_FILES,
  EXPORT_VERSION,
  HouseholdFileSchema,
  ManifestSchema,
  RecipeFileSchema,
} from "./format.ts"
import { openZip, type OpenZip } from "./zip.ts"

/** The largest export that can be uploaded. */
export const MAX_IMPORT_BYTES = 2_000_000_000

/** How long an upload waits to be tried again before it's cleared away. */
const KEEP_UPLOADS_DAYS = 7

/** Where uploads wait for their import job. */
export const uploadsFolder = (dataDir: string) =>
  join(dataDir, "tmp", "imports")

/**
 * Where an upload is kept. One with an owner (a household) can only be
 * found again with it, so its id alone can't reach someone else's file.
 */
export const uploadPath = (dataDir: string, id: string, owner?: string) =>
  join(uploadsFolder(dataDir), owner ? `${owner}.${id}.zip` : `${id}.zip`)

/**
 * Saves an upload to disk as it arrives, for a job to read. Stops past
 * `maxBytes`, without keeping any of it.
 */
export async function saveUpload(
  dataDir: string,
  body: ReadableStream<Uint8Array> | null,
  {
    owner,
    maxBytes = MAX_IMPORT_BYTES,
  }: { owner?: string; maxBytes?: number } = {}
) {
  if (!body) {
    throw new AppError("invalid", "no_file", "Choose a file to import.")
  }
  await mkdir(uploadsFolder(dataDir), { recursive: true })
  const id = randomUUID()
  const path = uploadPath(dataDir, id, owner)
  let size = 0
  const limit = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      size += chunk.length
      if (size > maxBytes) {
        done(
          new AppError(
            "too_large",
            "export_too_large",
            "That file is too big to import."
          )
        )
      } else {
        done(null, chunk)
      }
    },
  })
  try {
    await pipeline(
      Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]),
      limit,
      createWriteStream(path)
    )
  } catch (err) {
    await rm(path, { force: true })
    throw err
  }
  if (size === 0) {
    await rm(path, { force: true })
    throw new AppError("invalid", "no_file", "Choose a file to import.")
  }
  return { id, path }
}

/** Clears away uploads old enough that no one's trying them again. */
export async function clearOldUploads(dataDir: string) {
  const folder = uploadsFolder(dataDir)
  const before = Date.now() - KEEP_UPLOADS_DAYS * 24 * 60 * 60 * 1000
  let removed = 0
  for (const name of await readdir(folder).catch(() => [])) {
    const path = join(folder, name)
    const { mtimeMs } = await stat(path)
    if (mtimeMs < before) {
      await rm(path, { force: true })
      removed++
    }
  }
  return removed
}

const notAnExport = () =>
  new AppError(
    "invalid",
    "not_a_merran_export",
    "That isn't a Merran export. Export one from Settings → Import and export."
  )

/**
 * Opens an export: its manifest, checked at once, and its other files read
 * when they're wanted. Close it when done.
 */
export async function openExport(path: string) {
  let zip: OpenZip
  try {
    zip = await openZip(path)
  } catch {
    throw notAnExport()
  }
  const readJson = async <S extends z.ZodType>(name: string, schema: S) => {
    const file = await zip.read(name)
    if (!file) throw notAnExport()
    let parsed: unknown
    try {
      parsed = JSON.parse(file.toString("utf8"))
    } catch {
      throw notAnExport()
    }
    const checked = schema.safeParse(parsed)
    if (!checked.success) {
      throw new AppError(
        "invalid",
        "broken_export",
        `Part of that export (${name}) isn't as Merran wrote it, so it can't be imported.`
      )
    }
    return checked.data as z.infer<S>
  }

  try {
    const manifest = await readJson(EXPORT_FILES.manifest, ManifestSchema)
    if (manifest.version > EXPORT_VERSION) {
      throw new AppError(
        "invalid",
        "export_too_new",
        "That export is from a newer Merran. Update this one first."
      )
    }
    return {
      manifest,
      household: () => readJson(EXPORT_FILES.household, HouseholdFileSchema),
      recipes: () => readJson(EXPORT_FILES.recipes, RecipeFileSchema.array()),
      /** A file in the export, like a photo, or null if it's not there. */
      read: zip.read,
      close: zip.close,
    }
  } catch (err) {
    zip.close()
    throw err
  }
}

export type OpenExport = Awaited<ReturnType<typeof openExport>>

/**
 * Checks an upload is an export this Merran can read, before its job runs,
 * so a wrong file says so straight away. Deletes the upload if it isn't.
 */
export async function checkUpload(path: string) {
  try {
    const data = await openExport(path)
    data.close()
    return data.manifest
  } catch (err) {
    await rm(path, { force: true })
    throw err
  }
}

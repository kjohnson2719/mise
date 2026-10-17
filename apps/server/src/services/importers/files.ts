import { readFile, rm, stat } from "node:fs/promises"
import { AppError } from "../../core/errors.ts"
import type { Fetcher } from "../fetch/public-fetch.ts"
import { openZip, type OpenZip } from "../transfer/zip.ts"
import { readMealieBackup } from "./mealie/backup.ts"
import { readMealieExport } from "./mealie/export.ts"
import { readPaprikaExport, readPaprikaFile } from "./paprika.ts"
import type { AppSource, ImportApp } from "./types.ts"

// Files from other apps: which app a file is from, and what's in it, told
// from what's inside rather than its name.

/** The most a file that isn't a zip (one Paprika recipe) can be. */
const MAX_SINGLE_FILE_BYTES = 50_000_000

const notRecognized = () =>
  new AppError(
    "invalid",
    "not_an_import",
    "Merran can't read that file. Use a Mealie backup, recipes exported from Mealie, or a Paprika export."
  )

type Group = { id: string; name: string; recipes: number }

/** A file Merran knows, whichever app it's from. */
type Found = {
  app: ImportApp
  /** A whole backup, or recipes exported from the app. */
  what: "backup" | "recipes"
  groups: Group[]
  refs(group: string | null): string[]
  source(group: string | null, fetcher: Fetcher | null): AppSource
  close(): void
}

async function fromZip(zip: OpenZip): Promise<Found | null> {
  const backup = await readMealieBackup(zip)
  if (backup) {
    return {
      app: "mealie",
      what: "backup",
      groups: backup.groups.filter((group) => group.recipes > 0),
      refs: backup.refs,
      source: (group) => backup.source(group),
      close: zip.close,
    }
  }
  const mealie = await readMealieExport(zip)
  if (mealie) {
    return {
      app: "mealie",
      what: "recipes",
      groups: [],
      refs: () => mealie.refs,
      source: () => mealie.source(),
      close: zip.close,
    }
  }
  const paprika = await readPaprikaExport(zip)
  if (paprika) {
    return {
      app: "paprika",
      what: "recipes",
      groups: [],
      refs: () => paprika.refs,
      source: (_, fetcher) => paprika.source(fetcher),
      close: zip.close,
    }
  }
  return null
}

async function open(path: string): Promise<Found> {
  let zip: OpenZip | null = null
  try {
    zip = await openZip(path)
  } catch {
    // Not a zip: maybe one recipe on its own.
  }
  if (zip) {
    let found: Found | null
    try {
      found = await fromZip(zip)
    } catch (err) {
      zip.close()
      throw err
    }
    if (found) return found
    zip.close()
    throw notRecognized()
  }

  const { size } = await stat(path)
  const paprika =
    size <= MAX_SINGLE_FILE_BYTES ? readPaprikaFile(await readFile(path)) : null
  if (!paprika) throw notRecognized()
  return {
    app: "paprika",
    what: "recipes",
    groups: [],
    refs: () => paprika.refs,
    source: (_, fetcher) => paprika.source(fetcher),
    close: () => {},
  }
}

export type UploadSummary = {
  app: ImportApp
  what: "backup" | "recipes"
  recipes: number
  /** A backup's groups, when there's more than one to choose from. */
  groups: Group[]
  /** What each recipe is in the app, to see which are here already. */
  refs: string[]
}

/**
 * Says what an upload is, before its import starts. Deletes the upload if
 * it isn't something Merran can import.
 */
export async function inspectUpload(path: string): Promise<UploadSummary> {
  let found: Found
  try {
    found = await open(path)
  } catch (err) {
    await rm(path, { force: true })
    throw err
  }
  try {
    const refs = found.refs(null)
    return {
      app: found.app,
      what: found.what,
      recipes: refs.length,
      groups: found.groups.length > 1 ? found.groups : [],
      refs,
    }
  } finally {
    found.close()
  }
}

/** The recipes in an upload, for its import job. */
export async function openUpload(
  path: string,
  { group, fetcher }: { group: string | null; fetcher: Fetcher | null }
): Promise<AppSource> {
  if (!(await stat(path).catch(() => null))) {
    throw new AppError(
      "not_found",
      "upload_gone",
      "That file isn't here any more. Choose it again."
    )
  }
  const found = await open(path)
  return found.source(group, fetcher)
}

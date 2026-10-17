import type { EntityManager } from "@mikro-orm/sql"
import { AppError } from "../../core/errors.ts"
import { MAX_PHOTOS, type AiDeps } from "../recipes/import/ai-reader.ts"
import { importLink } from "../recipes/import/import-link.ts"
import { MAX_LINKS, startLinkImport } from "../recipes/import/import-links.ts"
import { importPhotos, importText } from "../recipes/import/import-with-ai.ts"
import { MAX_RECEIPT_FILES, readReceipt } from "../receipts/receipts.ts"
import type { FileStore } from "../storage/files.ts"
import type { VideoDeps } from "../recipes/import/import-video.ts"
import { sharedLinks, sharedPhotos, sharedText, type Shared } from "./links.ts"

// Something shared to Merran, from Android's share sheet or an iPhone
// Shortcut, dealt with at once. A link to a recipe is imported there and
// then, and several start an import that goes on in the background.
// Without a link, photos, PDFs or text are read by AI: a receipt waits to
// be looked over for the pantry, and a recipe is added.

type Base = {
  /** Said in words, so a Shortcut can show it as it is. */
  message: string
}

export type ShareOutcome = Base &
  (
    | {
        outcome: "added" | "already"
        code: null
        recipe: { id: string; slug: string; name: string }
        importId: null
        receiptId: null
        /** The recipe's page. */
        url: string
      }
    | {
        outcome: "importing"
        code: null
        recipe: null
        /** The import, to follow at /recipes/import/links/{importId}. */
        importId: string
        receiptId: null
        /** Its page. */
        url: string
      }
    | {
        outcome: "receipt"
        code: null
        recipe: null
        importId: null
        /** The receipt, read and waiting for a look. */
        receiptId: string
        /** Its page. */
        url: string
      }
    | {
        outcome: "failed"
        /** Stable, for programs: "no_recipe", "no_recipe_data" and the like. */
        code: string
        recipe: null
        importId: null
        receiptId: null
        url: null
      }
  )

/** Shared text past this isn't read: no recipe is this long. */
const MAX_TEXT = 50_000

const failed = (code: string, message: string): ShareOutcome => ({
  outcome: "failed",
  code,
  message,
  recipe: null,
  importId: null,
  receiptId: null,
  url: null,
})

/** A recipe added from what was shared, as a share answers. */
function added(
  recipe: { id: string; slug: string; name: string },
  duplicate: boolean,
  baseUrl: string
): ShareOutcome {
  return {
    outcome: duplicate ? "already" : "added",
    code: null,
    message: duplicate
      ? `${recipe.name} is in Merran already.`
      : `Added ${recipe.name} to Merran.`,
    recipe: { id: recipe.id, slug: recipe.slug, name: recipe.name },
    importId: null,
    receiptId: null,
    url: `${baseUrl}/recipes/${recipe.slug}`,
  }
}

/**
 * Photos, PDFs or text, read by AI: a receipt waits for a look, a recipe
 * is added. Without AI, it says reading them needs it.
 */
async function readShared(
  em: EntityManager,
  deps: AiDeps & VideoDeps & { files: FileStore },
  options: {
    householdId: string
    userId: string
    shared: Shared
    baseUrl: string
  }
): Promise<ShareOutcome> {
  const photos = sharedPhotos(options.shared)
  const text = photos.length > 0 ? null : sharedText(options.shared)
  if (photos.length === 0 && !text) {
    return failed(
      "no_recipe",
      "Merran adds recipes from links, photos, PDFs and text, and receipts from photos, PDFs and text. Share one of those."
    )
  }
  // A receipt first, which says what it was: the small model's quick.
  try {
    const { what, receipt } = await readReceipt(em, deps, {
      householdId: options.householdId,
      userId: options.userId,
      input: {
        files: photos
          .slice(0, MAX_RECEIPT_FILES)
          .map((body) => ({ body, type: "" })),
        text,
      },
    })
    if (receipt) {
      const count = receipt.lines.length
      return {
        outcome: "receipt",
        code: null,
        message: `Read a receipt${receipt.store ? ` from ${receipt.store}` : ""}: ${count} ${count === 1 ? "thing" : "things"} to look over for the pantry.`,
        recipe: null,
        importId: null,
        receiptId: receipt.id,
        url: `${options.baseUrl}/pantry/receipts/${receipt.id}`,
      }
    }
    // Not a receipt: the import model reads it again as a recipe, or says
    // there's none in it.
    void what
  } catch (err) {
    // Reading receipts can be off while importing isn't: try a recipe.
    if (!(err instanceof AppError) || !err.code.startsWith("ai_")) throw err
  }
  try {
    const recipe = photos.length
      ? await importPhotos(em, deps, {
          householdId: options.householdId,
          userId: options.userId,
          photos: photos.slice(0, MAX_PHOTOS),
        })
      : await importText(em, deps, {
          householdId: options.householdId,
          userId: options.userId,
          text: text!.slice(0, MAX_TEXT),
        })
    return added(recipe, false, options.baseUrl)
  } catch (err) {
    if (!(err instanceof AppError)) throw err
    // No AI, or none left this month: say what it was for.
    const needsAi = err.code.startsWith("ai_") && err.kind !== "upstream"
    const what = photos.length ? "Photos" : "Text"
    return failed(
      err.code,
      needsAi
        ? `${what} of a recipe need AI to read. ${err.message}`
        : err.message
    )
  }
}

/** Works out what was shared, and adds it. */
export async function shareToMerran(
  em: EntityManager,
  deps: AiDeps & VideoDeps & { files: FileStore },
  options: {
    householdId: string
    userId: string
    shared: Shared
    /** Merran's own address, for the pages it links to. */
    baseUrl: string
  }
): Promise<ShareOutcome> {
  const { shared } = options
  if (shared.files.length === 0 && !shared.text) {
    return failed("nothing_shared", "Nothing came through to share.")
  }
  const links = sharedLinks(shared)
  if (links.length === 0) return readShared(em, deps, options)

  try {
    if (links.length > 1) {
      const job = await startLinkImport(em, {
        householdId: options.householdId,
        userId: options.userId,
        urls: links,
      })
      const count = Math.min(links.length, MAX_LINKS)
      return {
        outcome: "importing",
        code: null,
        message: `Adding ${count} recipes to Merran.`,
        recipe: null,
        importId: job.id,
        receiptId: null,
        url: `${options.baseUrl}/recipes/import/${job.id}`,
      }
    }

    const { recipe, duplicate } = await importLink(em, deps, {
      householdId: options.householdId,
      userId: options.userId,
      url: links[0]!,
    })
    return added(recipe, duplicate, options.baseUrl)
  } catch (err) {
    // Why the link couldn't come in, as the link import says it.
    if (err instanceof AppError) return failed(err.code, err.message)
    throw err
  }
}

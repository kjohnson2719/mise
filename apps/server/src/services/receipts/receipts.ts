import { covers, foodKey, readAmount, type ModelAbility } from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { generateText, Output, type UserContent } from "ai"
import sharp from "sharp"
import { v7 as uuidv7 } from "uuid"
import { z } from "zod"
import { AppError } from "../../core/errors.ts"
import {
  Purchase,
  Receipt,
  ShoppingItem,
  User,
  type ReceiptFile,
  type ReceiptLine,
} from "../../database/entities/index.ts"
import { householdKeys } from "../list/food-aliases.ts"
import { useAi, type AiDeps } from "../ai/run.ts"
import { householdToday, placeFor, store } from "../pantry/pantry.ts"
import { inHouseholdTransaction, toNumber } from "../recipes/recipes.ts"
import type { FileStore } from "../storage/files.ts"

// Receipts into the pantry: a photo of a paper one, screenshots or a PDF
// of an emailed one, or its text. The household's small model reads the
// lines ("GV WHL MLK 1GAL" is whole milk, 1 gal), and they wait for a look
// before anything goes in. What's added is put away like shopping: in the
// fridge, freezer or cupboard with a use-by guess, kept for the meals it
// was bought for, and noted for usual buys; and it comes off the list.

/** Up to this many files a receipt. */
export const MAX_RECEIPT_FILES = 6

/** The largest PDF of a receipt. */
const MAX_PDF_BYTES = 10_000_000

/** Tiles cut from one tall screenshot, at most. */
const MAX_TILES = 8

/** Receipt text past this isn't read; no receipt is this long. */
const MAX_TEXT = 40_000

/** A receipt waits this long for its look before it's forgotten. */
const KEEP_MS = 24 * 60 * 60_000

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const SYSTEM = `You read grocery receipts: photos, screenshots, PDFs, or the text of an emailed receipt or order confirmation. List what was bought.
- First, "what" it is: "receipt" for a receipt or order confirmation, "recipe" for a recipe (ingredients and steps, a recipe card, a screenshot of one), "other" for anything else.
- One entry per product line. Skip totals, subtotals, tax, payment, change, coupons, discounts, bag fees, deposits and loyalty lines.
- "text" is the line as printed. "name" is the plain grocery name a home cook would write on a list: "GV WHL MLK 1GAL" is "whole milk", "BNLS SKNLS CHKN THGH" is "boneless skinless chicken thighs". Leave brands out unless they're the point (Diet Pepsi).
- "amount" is how much, as a cook would say it: "1 gal", "2.3 lb", "12 ct", "2" for two of something; null when the receipt doesn't say.
- "price" is what was paid for that line, after any discount on it; null if unclear.
- "kind": "food" for anything eaten or drunk (soda too), "household" for paper goods, cleaning, toiletries and the like, "other" for anything else.
- "store" and "date" (YYYY-MM-DD) from the receipt when shown, else null. "total" is the amount paid, else null.
If it isn't a receipt, return no items.`

const ReadReceipt = z.object({
  what: z.enum(["receipt", "recipe", "other"]),
  store: z.string().nullable(),
  date: z.string().nullable(),
  total: z.number().nullable(),
  items: z.array(
    z.object({
      text: z.string(),
      name: z.string(),
      amount: z.string().nullable(),
      price: z.number().nullable(),
      kind: z.enum(["food", "household", "other"]),
    })
  ),
})

/** What came in to read: files of any kind, and text. */
export type ReceiptInput = {
  files: readonly { body: Buffer; type: string }[]
  text: string | null
}

const isPdf = (body: Buffer) =>
  body.subarray(0, 5).toString("latin1") === "%PDF-"

const fileKey = (householdId: string, receiptId: string, index: number) =>
  `receipts/${householdId}/${receiptId}/${index}`

/** An emailed receipt's text, without its HTML. */
export function plainText(text: string) {
  return /<\/?[a-z][^>]*>/i.test(text)
    ? text
        .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
        .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/[ \t]+/g, " ")
        .replace(/ ?\n ?/g, "\n")
        .replace(/\n\s*\n+/g, "\n")
        .trim()
    : text.trim()
}

/**
 * A photo for the model, and the copy kept to compare with. A tall
 * screenshot of an emailed receipt is cut into overlapping tiles, so the
 * print stays big enough to read.
 */
async function readPicture(body: Buffer) {
  let upright: Buffer
  let width: number
  let height: number
  try {
    const image = sharp(body, { failOn: "error" }).rotate()
    upright = await image.toBuffer()
    const meta = await sharp(upright).metadata()
    width = meta.width ?? 0
    height = meta.height ?? 0
    if (!width || !height) throw new Error("No size")
  } catch {
    throw new AppError(
      "invalid",
      "not_a_receipt_file",
      "One of those files isn't a photo, screenshot or PDF Merran can read."
    )
  }
  const tileHeight = Math.round(width * 1.4)
  const tiles =
    height > tileHeight * 1.3
      ? Math.min(MAX_TILES, Math.ceil(height / (tileHeight - 80)))
      : 1
  const parts: Exclude<UserContent, string> = []
  for (let i = 0; i < tiles; i++) {
    const top =
      tiles === 1 ? 0 : Math.round(((height - tileHeight) * i) / (tiles - 1))
    const piece = sharp(upright)
    if (tiles > 1) {
      piece.extract({
        left: 0,
        top,
        width,
        height: Math.min(tileHeight, height - top),
      })
    }
    const jpeg = await piece
      .resize({
        width: 1400,
        height: 2000,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85 })
      .toBuffer()
    parts.push({ type: "file", data: jpeg, mediaType: "image/jpeg" })
  }
  const kept = await sharp(upright)
    .resize({ width: 1200, withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer()
  return { parts, kept }
}

/** What the model reads, what's kept to look at, and what the model needs. */
async function receiptContent(input: ReceiptInput) {
  if (input.files.length > MAX_RECEIPT_FILES) {
    throw new AppError(
      "invalid",
      "too_many_files",
      `Use ${MAX_RECEIPT_FILES} files or fewer for one receipt.`
    )
  }
  const content: Exclude<UserContent, string> = []
  const kept: { body: Buffer; mediaType: ReceiptFile["mediaType"] }[] = []
  const texts: string[] = []
  const needs = new Set<ModelAbility>(["structured"])
  for (const file of input.files) {
    if (isPdf(file.body)) {
      if (file.body.length > MAX_PDF_BYTES) {
        throw new AppError(
          "too_large",
          "file_too_large",
          "That PDF is too big. Use one under 10 MB."
        )
      }
      content.push({
        type: "file",
        data: file.body,
        mediaType: "application/pdf",
      })
      kept.push({ body: file.body, mediaType: "application/pdf" })
      needs.add("pdfs")
    } else if (file.type.startsWith("text/")) {
      texts.push(plainText(file.body.toString("utf8")))
    } else {
      const picture = await readPicture(file.body)
      content.push(...picture.parts)
      kept.push({ body: picture.kept, mediaType: "image/jpeg" })
      needs.add("images")
    }
  }
  if (input.text) texts.push(plainText(input.text))
  const text = texts.filter(Boolean).join("\n\n").slice(0, MAX_TEXT)
  if (content.length === 0 && !text) {
    throw new AppError(
      "invalid",
      "no_receipt",
      "Add a photo, screenshot or PDF of the receipt, or paste its text."
    )
  }
  content.push({
    type: "text",
    text: text ? `The receipt:\n\n${text}` : "Read this receipt.",
  })
  return { content, kept, needs: [...needs] }
}

/** A receipt as the API shows it. */
export function describeReceipt(receipt: Receipt) {
  return {
    id: receipt.id,
    store: receipt.store ?? null,
    date: receipt.date ?? null,
    total: toNumber(receipt.total),
    lines: receipt.lines,
    files: receipt.files.map((file, index) => ({
      url: `/api/pantry/receipts/${receipt.id}/files/${index}`,
      mediaType: file.mediaType,
    })),
    createdAt: receipt.createdAt.toISOString(),
  }
}
export type ReceiptView = ReturnType<typeof describeReceipt>

/**
 * The shopping list items lines were bought for: the same food, not yet
 * checked off, each matched once.
 */
async function matchList(
  em: EntityManager,
  lines: readonly Omit<ReceiptLine, "listItem">[]
): Promise<ReceiptLine[]> {
  const keyOf = await householdKeys(em)
  const waiting = await em.find(
    ShoppingItem,
    { checked: false },
    { fields: ["id", "name"], orderBy: { createdAt: "asc" } }
  )
  const claimed = new Set<string>()
  return lines.map((line) => {
    const key = keyOf(line.name)
    const match =
      line.kind === "other"
        ? undefined
        : waiting.find((item) => {
            if (claimed.has(item.id)) return false
            const theirs = keyOf(item.name)
            return (
              // Bought what's on the list, or a kind of it.
              covers(key, theirs) ||
              key.endsWith(` ${theirs}`) ||
              theirs.endsWith(` ${key}`)
            )
          })
    if (match) claimed.add(match.id)
    return {
      ...line,
      listItem: match ? { id: match.id, name: match.name } : null,
    }
  })
}

/** Receipts never looked over, and their files: gone after a day. */
async function forgetOld(
  em: EntityManager,
  files: FileStore,
  householdId: string
) {
  const old = await em.find(Receipt, {
    createdAt: { $lt: new Date(Date.now() - KEEP_MS) },
  })
  for (const receipt of old) {
    await files.remove(`receipts/${householdId}/${receipt.id}`)
    em.remove(receipt)
  }
}

/**
 * Reads a receipt into a draft to look over; nothing's added yet. Says
 * what it was, too: what's shared to Merran may be a recipe instead, which
 * isn't kept as a receipt.
 */
export async function readReceipt(
  em: EntityManager,
  deps: AiDeps & { files: FileStore },
  options: { householdId: string; userId: string | null; input: ReceiptInput }
): Promise<{
  what: "receipt" | "recipe" | "other"
  receipt: ReceiptView | null
}> {
  const { content, kept, needs } = await receiptContent(options.input)
  const { output } = await useAi(
    deps,
    em,
    {
      householdId: options.householdId,
      userId: options.userId,
      task: "receipts",
      needs,
    },
    (model) =>
      generateText({
        model,
        system: SYSTEM,
        messages: [{ role: "user", content }],
        output: Output.object({ schema: ReadReceipt, name: "receipt" }),
        maxOutputTokens: 8000,
      })
  )
  const items = output.items.filter((item) => item.name.trim())
  if (output.what !== "receipt" || items.length === 0) {
    return {
      what: output.what === "receipt" ? "other" : output.what,
      receipt: null,
    }
  }

  const lines = await matchList(
    em,
    items.slice(0, 300).map((item) => ({
      id: uuidv7().slice(-12),
      text: item.text.trim().slice(0, 200),
      name: item.name.trim().slice(0, 200),
      amount: item.amount?.trim().slice(0, 60) || null,
      price:
        item.price !== null && Number.isFinite(item.price) ? item.price : null,
      kind: item.kind,
    }))
  )
  const today = await householdToday(em, options.householdId)
  const date =
    output.date &&
    /^\d{4}-\d{2}-\d{2}$/.test(output.date) &&
    output.date <= today
      ? output.date
      : null
  await forgetOld(em, deps.files, options.householdId)
  const receipt = em.create(Receipt, {
    household: options.householdId,
    user: options.userId
      ? em.getReference(User, options.userId, { wrapped: true })
      : null,
    store: output.store?.trim().slice(0, 120) || null,
    date,
    total:
      output.total !== null && Number.isFinite(output.total)
        ? output.total
        : null,
    lines,
    files: kept.map((file) => ({ mediaType: file.mediaType })),
  })
  await Promise.all(
    kept.map((file, index) =>
      deps.files.put(fileKey(options.householdId, receipt.id, index), file.body)
    )
  )
  await em.flush()
  return { what: "receipt", receipt: describeReceipt(receipt) }
}

/** Receipts waiting for a look, newest first: shared ones, say. */
export async function listReceipts(em: EntityManager) {
  const receipts = await em.find(
    Receipt,
    { createdAt: { $gte: new Date(Date.now() - KEEP_MS) } },
    { orderBy: { createdAt: "desc" } }
  )
  return receipts.map(describeReceipt)
}

/** A receipt waiting for its look. */
export async function findReceipt(em: EntityManager, receiptId: string) {
  const receipt = UUID.test(receiptId)
    ? await em.findOne(Receipt, {
        id: receiptId,
        createdAt: { $gte: new Date(Date.now() - KEEP_MS) },
      })
    : null
  if (!receipt) {
    throw new AppError(
      "not_found",
      "receipt_not_found",
      "That receipt isn't waiting any more. Scan it again."
    )
  }
  return receipt
}

/** One of a receipt's photos or PDFs, to compare with. */
export async function readReceiptFile(
  em: EntityManager,
  files: FileStore,
  options: { householdId: string; receiptId: string; index: number }
) {
  const receipt = await findReceipt(em, options.receiptId)
  const file = receipt.files[options.index]
  const body = file
    ? await files.read(fileKey(options.householdId, receipt.id, options.index))
    : null
  if (!file || !body) {
    throw new AppError("not_found", "file_not_found", "There's no such file.")
  }
  return { body, mediaType: file.mediaType }
}

/** Forgets a receipt without adding anything. */
export async function discardReceipt(
  em: EntityManager,
  files: FileStore,
  options: { householdId: string; receiptId: string }
) {
  const receipt = await findReceipt(em, options.receiptId)
  await em.remove(receipt).flush()
  await files.remove(`receipts/${options.householdId}/${receipt.id}`)
}

/**
 * Puts the chosen lines in the pantry, as named and measured after a
 * look, and takes what they were bought for off the list. The receipt's
 * done with after.
 */
export async function addReceipt(
  em: EntityManager,
  files: FileStore,
  options: {
    householdId: string
    receiptId: string
    items: readonly { id: string; name: string; amount: string | null }[]
  }
) {
  const keyOf = await householdKeys(em)
  const { householdId } = options
  const result = await inHouseholdTransaction(em, householdId, async (tx) => {
    const receipt = await findReceipt(tx, options.receiptId)
    const byId = new Map(receipt.lines.map((line) => [line.id, line]))
    const today = await householdToday(tx, householdId)
    let added = 0
    let offTheList = 0
    for (const chosen of options.items) {
      const line = byId.get(chosen.id)
      const name = chosen.name.trim()
      if (!line || !name) continue
      byId.delete(chosen.id)
      const amount = readAmount(chosen.amount ?? "")
      const bought = line.listItem
        ? await tx.findOne(
            ShoppingItem,
            { id: line.listItem.id },
            { populate: ["aisle"] }
          )
        : null
      tx.create(Purchase, {
        household: householdId,
        foodKey: keyOf(name),
        name,
        quantity: amount.quantity,
        unit: amount.unit,
        amountText: amount.amountText,
        boughtOn: receipt.date ?? today,
      })
      const place = await placeFor(
        tx,
        householdId,
        {
          name,
          unit: amount.unit,
          ...(bought?.aisle ? { aisle: bought.aisle.getEntity() } : {}),
        },
        today
      )
      await store(tx, householdId, {
        name,
        quantity: amount.quantity,
        unit: amount.unit,
        amountText: amount.amountText,
        aisle: place.aisle,
        storedIn: place.storedIn,
        useBy: place.useBy,
        forMeals: bought?.forMeals ?? [],
      })
      if (bought) {
        tx.remove(bought)
        offTheList++
      }
      // So the next of the same food joins it.
      await tx.flush()
      added++
    }
    tx.remove(receipt)
    await tx.flush()
    return { added, offTheList, receiptId: receipt.id }
  })
  await files.remove(`receipts/${householdId}/${result.receiptId}`)
  return { added: result.added, offTheList: result.offTheList }
}

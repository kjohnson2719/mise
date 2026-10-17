import { randomBytes } from "node:crypto"
import type { UIMessage } from "ai"
import sharp from "sharp"
import { AppError } from "../../core/errors.ts"
import type { FileStore } from "../storage/files.ts"

// Files sent to the assistant: a photo of what's in the pan, or a recipe
// as a PDF. Kept with the person's chats (photos as JPEG at the size models
// read them, PDFs as they are), and shown from their own link.

/** The most files one message has. */
export const MAX_MESSAGE_FILES = 4

/** The largest PDF, which models read page by page. */
export const MAX_PDF_BYTES = 10_000_000

/** The latest photos and PDFs in a chat the model sees; older ones are said in words. */
const SEEN = { image: 8, pdf: 2 }

/** Models read photos at about this many pixels on the long side. */
const LONG_SIDE = 1568

const FILE_ID = /^[a-f0-9]{24}$/
const FILE_URL = /^\/api\/assistant\/files\/([a-f0-9]{24})$/

export type ChatFileType = "image/jpeg" | "application/pdf"

/** Whose files: each person's chats are their own. */
export type FileOwner = { householdId: string; userId: string }

const key = (owner: FileOwner, fileId: string) =>
  `assistant/${owner.householdId}/${owner.userId}/${fileId}`

const isPdf = (body: Buffer) =>
  body.subarray(0, 5).toString("latin1") === "%PDF-"

/** Where a file is shown from, which is also how a message names it. */
export const fileUrl = (fileId: string) => `/api/assistant/files/${fileId}`

/** Keeps a photo (the right way up and made smaller) or a PDF. */
export async function storeChatFile(
  files: FileStore,
  owner: FileOwner,
  input: Buffer
): Promise<{ id: string; url: string; mediaType: ChatFileType }> {
  let body: Buffer
  let mediaType: ChatFileType
  if (isPdf(input)) {
    if (input.length > MAX_PDF_BYTES) {
      throw new AppError(
        "too_large",
        "file_too_large",
        "That PDF is too big. Use one under 10 MB."
      )
    }
    body = input
    mediaType = "application/pdf"
  } else {
    try {
      body = await sharp(input, { failOn: "error" })
        .rotate()
        .resize({
          width: LONG_SIDE,
          height: LONG_SIDE,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 82 })
        .toBuffer()
    } catch {
      throw new AppError(
        "invalid",
        "not_a_photo_or_pdf",
        "That file isn't a photo or PDF Merran can read. Use JPEG, PNG, WebP or PDF."
      )
    }
    mediaType = "image/jpeg"
  }
  const fileId = randomBytes(12).toString("hex")
  await files.put(key(owner, fileId), body)
  return { id: fileId, url: fileUrl(fileId), mediaType }
}

/** A file of theirs and its type, or null if there's no such file. */
export async function readChatFile(
  files: FileStore,
  owner: FileOwner,
  fileId: string
): Promise<{ body: Buffer; mediaType: ChatFileType } | null> {
  if (!FILE_ID.test(fileId)) return null
  const body = await files.read(key(owner, fileId))
  if (!body) return null
  return { body, mediaType: isPdf(body) ? "application/pdf" : "image/jpeg" }
}

/** The files in messages, in order. */
export function filesIn(messages: readonly UIMessage[]) {
  return messages.flatMap((message) =>
    message.parts.flatMap((part) => {
      const id = part.type === "file" ? FILE_URL.exec(part.url)?.[1] : null
      return id && part.type === "file"
        ? [{ id, mediaType: part.mediaType }]
        : []
    })
  )
}

/** Deletes files. One that's already gone is fine. */
export async function removeChatFiles(
  files: FileStore,
  owner: FileOwner,
  fileIds: readonly string[]
) {
  await Promise.all(
    fileIds
      .filter((id) => FILE_ID.test(id))
      .map((id) => files.remove(key(owner, id)))
  )
}

/**
 * Messages as the model gets them: the latest photos and PDFs in them
 * read in from where they're kept, and older ones, or any that are gone,
 * said in words, so a long chat doesn't send every file every time.
 */
export async function withFiles(
  files: FileStore,
  owner: FileOwner,
  messages: readonly UIMessage[]
): Promise<UIMessage[]> {
  const all = filesIn(messages)
  const latest = (pdf: boolean) =>
    all
      .filter((file) => (file.mediaType === "application/pdf") === pdf)
      .slice(-(pdf ? SEEN.pdf : SEEN.image))
      .map((file) => file.id)
  const seen = new Set([...latest(false), ...latest(true)])
  return Promise.all(
    messages.map(async (message) => {
      if (!message.parts.some((part) => part.type === "file")) return message
      const parts = await Promise.all(
        message.parts.map(async (part): Promise<UIMessage["parts"][number]> => {
          if (part.type !== "file") return part
          const id = FILE_URL.exec(part.url)?.[1]
          const file =
            id && seen.has(id) ? await readChatFile(files, owner, id) : null
          if (file) {
            return {
              ...part,
              mediaType: file.mediaType,
              url: `data:${file.mediaType};base64,${file.body.toString("base64")}`,
            }
          }
          return {
            type: "text",
            text:
              part.mediaType === "application/pdf"
                ? `(The PDF${part.filename ? ` "${part.filename}"` : ""}, no longer shown. Ask for it again if it's needed.)`
                : "(A photo, no longer shown.)",
          }
        })
      )
      return { ...message, parts }
    })
  )
}

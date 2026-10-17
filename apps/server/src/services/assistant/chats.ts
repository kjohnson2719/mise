import type { EntityManager } from "@mikro-orm/sql"
import type { UIMessage } from "ai"
import { AppError } from "../../core/errors.ts"
import { Chat, ChatMessage, User } from "../../database/entities/index.ts"
import type { FileStore } from "../storage/files.ts"
import { filesIn, removeChatFiles } from "./files.ts"

// A person's chats with the assistant, in the household they're in: kept
// to pick up again, newest first. Each message is kept as AI SDK's UI
// message, text, tool calls and all.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A new chat's title, until its first message gives it one. */
export const NEW_CHAT = "New chat"

/** The most chats listed. */
const LISTED = 50

const describeChat = (chat: Chat) => ({
  id: chat.id,
  title: chat.title,
  createdAt: chat.createdAt.toISOString(),
  updatedAt: chat.updatedAt.toISOString(),
})
export type ChatView = ReturnType<typeof describeChat>

/** A person's chats, newest first. */
export async function listChats(em: EntityManager, userId: string) {
  const chats = await em.find(
    Chat,
    { user: userId },
    { orderBy: { updatedAt: "desc", id: "desc" }, limit: LISTED }
  )
  return chats.map(describeChat)
}

/** One of a person's chats; someone else's isn't there. */
export async function findChat(
  em: EntityManager,
  userId: string,
  chatId: string
) {
  const chat = UUID.test(chatId)
    ? await em.findOne(Chat, { id: chatId, user: userId })
    : null
  if (!chat) {
    throw new AppError("not_found", "chat_not_found", "There's no such chat.")
  }
  return chat
}

/** A chat's messages, in order. */
export async function chatMessages(em: EntityManager, chat: Chat) {
  const rows = await em.find(
    ChatMessage,
    { chat: chat.id },
    { orderBy: { position: "asc" } }
  )
  return rows.map((row) => row.message as unknown as UIMessage)
}

/** A chat with its messages. */
export async function getChat(
  em: EntityManager,
  userId: string,
  chatId: string
) {
  const chat = await findChat(em, userId, chatId)
  return { ...describeChat(chat), messages: await chatMessages(em, chat) }
}

export async function startChat(
  em: EntityManager,
  options: { householdId: string; userId: string }
) {
  const chat = em.create(Chat, {
    household: options.householdId,
    user: em.getReference(User, options.userId, { wrapped: true }),
    title: NEW_CHAT,
  })
  await em.flush()
  return describeChat(chat)
}

/** Deletes a chat, with its messages and the files in them. */
export async function deleteChat(
  em: EntityManager,
  files: FileStore,
  owner: { householdId: string; userId: string },
  chatId: string
) {
  const chat = await findChat(em, owner.userId, chatId)
  const sent = filesIn(await chatMessages(em, chat))
  await em.remove(chat).flush()
  await removeChatFiles(
    files,
    owner,
    sent.map((file) => file.id)
  )
}

/**
 * Adds messages to a chat, after the ones it has. Its first message from
 * the person names it.
 */
export async function addMessages(
  em: EntityManager,
  chat: Chat,
  messages: readonly UIMessage[]
) {
  const last = await em.findOne(
    ChatMessage,
    { chat: chat.id },
    { orderBy: { position: "desc" }, fields: ["position"] }
  )
  let position = (last?.position ?? -1) + 1
  for (const message of messages) {
    em.create(ChatMessage, {
      household: chat.household,
      chat,
      position: position++,
      message: message as unknown as Record<string, unknown>,
    })
  }
  if (chat.title === NEW_CHAT) {
    const first = messages.find((message) => message.role === "user")
    const text = first?.parts
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
    if (text) chat.title = text.length > 60 ? `${text.slice(0, 57)}…` : text
  }
  // Touched, so it's listed first.
  chat.updatedAt = new Date()
  await em.flush()
}

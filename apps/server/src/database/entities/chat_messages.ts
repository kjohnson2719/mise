import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { householdFilter } from "../scope.ts"
import { createdAt, id } from "./base.ts"
import { Chat } from "./chats.ts"
import { householdRef } from "./households.ts"

/**
 * A message in a chat, as AI SDK's UI message: the person's, or the
 * assistant's with its text, tool calls and their results.
 */
export const ChatMessage = defineEntity({
  name: "ChatMessage",
  tableName: "chat_messages",
  properties: {
    id: id(),
    household: () => householdRef(),
    chat: () => p.manyToOne(Chat).ref().deleteRule("cascade").index(),
    position: p.integer(),
    message: p.json<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  filters: householdFilter,
})
export type ChatMessage = InferEntity<typeof ChatMessage>

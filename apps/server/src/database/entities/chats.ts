import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { householdFilter } from "../scope.ts"
import { createdAt, id, updatedAt } from "./base.ts"
import { householdRef } from "./households.ts"
import { User } from "./users.ts"

/** A conversation with the assistant: one person's, in one household. */
export const Chat = defineEntity({
  name: "Chat",
  tableName: "chats",
  properties: {
    id: id(),
    household: () => householdRef(),
    user: () => p.manyToOne(User).ref().deleteRule("cascade").index(),
    /** From its first message. */
    title: p.string(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  indexes: [{ properties: ["household", "user", "updatedAt"] }],
  filters: householdFilter,
})
export type Chat = InferEntity<typeof Chat>

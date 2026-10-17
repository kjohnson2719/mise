import { z } from "@hono/zod-openapi"
import {
  MAX_MESSAGE_FILES,
  MAX_PDF_BYTES,
} from "../../services/assistant/files.ts"
import { IDS, TIMES } from "./examples.ts"

const FILE_ID = "4f1c2a9e7b3d5f6a8c0e1b2d"

const CHAT = {
  id: IDS.chat,
  title: "What can I make with leftover chicken?",
  createdAt: TIMES.created,
  updatedAt: TIMES.now,
}

export const ChatSchema = z
  .object({
    id: z.string(),
    title: z.string().openapi({ description: "From its first message." }),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .openapi("Chat", { example: CHAT })

export const ChatListSchema = z
  .object({ chats: z.array(ChatSchema) })
  .openapi("ChatList", { example: { chats: [CHAT] } })

const MESSAGE = {
  id: IDS.chatMessage,
  role: "user",
  parts: [{ type: "text", text: "What can I make with leftover chicken?" }],
}

export const ChatWithMessagesSchema = ChatSchema.extend({
  messages: z.array(z.record(z.string(), z.unknown())).openapi({
    description:
      "Its messages in order, as AI SDK's UI messages: each with an id, a role, and parts (text, and the assistant's tool calls with their results).",
  }),
}).openapi("ChatWithMessages", { example: { ...CHAT, messages: [MESSAGE] } })

export const ChatParam = z.object({
  chatId: z
    .string()
    .openapi({ param: { name: "chatId", in: "path" }, example: IDS.chat }),
})

export const ChatMessageInputSchema = z
  .object({
    text: z
      .string()
      .trim()
      .max(4000, "Keep it under 4,000 characters.")
      .default("")
      .openapi({ description: "What they say. Can be left out with files." }),
    files: z
      .array(
        z.object({
          id: z.string().regex(/^[a-f0-9]{24}$/, "That isn't a file's id."),
          name: z.string().trim().max(200).optional().openapi({
            description:
              'Its name, to show and to tell the model: "lasagna.pdf".',
          }),
        })
      )
      .max(MAX_MESSAGE_FILES, `Send ${MAX_MESSAGE_FILES} files or fewer.`)
      .optional()
      .openapi({
        description: `Photos and PDFs to send with it, up to ${MAX_MESSAGE_FILES}, by the ids \`POST /assistant/files\` gave them: a photo of what they're cooking, or a recipe to draft. The message keeps them as file parts, linking to each file.`,
      }),
    context: z
      .object({
        recipe: z.string().optional().openapi({
          description: "The recipe on their screen, by id or address.",
        }),
        week: z.string().optional().openapi({
          description: "The first day of the week of the plan on their screen.",
        }),
      })
      .optional()
      .openapi({
        description:
          'What\'s on their screen, for the assistant to know: "this recipe" is the one there.',
      }),
  })
  .refine((input) => input.text || input.files?.length, {
    message: "Say something, or add a photo or file.",
    path: ["text"],
  })
  .openapi("ChatMessageInput", {
    example: {
      text: "Is this thick enough?",
      files: [{ id: FILE_ID, name: "sauce.jpg" }],
      context: { recipe: IDS.lemonChicken },
    },
  })

export const AssistantFileSchema = z
  .object({
    id: z.string(),
    url: z.string().openapi({ description: "Where it's shown from." }),
    mediaType: z.enum(["image/jpeg", "application/pdf"]).openapi({
      description: "A photo is kept as JPEG; a PDF as it is.",
    }),
  })
  .openapi("AssistantFile", {
    example: {
      id: FILE_ID,
      url: `/api/assistant/files/${FILE_ID}`,
      mediaType: "image/jpeg",
    },
  })

export const AssistantFileParam = z.object({
  fileId: z
    .string()
    .openapi({ param: { name: "fileId", in: "path" }, example: FILE_ID }),
})

/** The largest PDF, in words. */
export const PDF_LIMIT = `${MAX_PDF_BYTES / 1_000_000} MB`

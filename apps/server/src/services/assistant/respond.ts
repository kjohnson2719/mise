import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai"
import { v7 as uuidv7 } from "uuid"
import type { AppDeps } from "../../core/context.ts"
import { AppError } from "../../core/errors.ts"
import { Household, User } from "../../database/entities/index.ts"
import { forHousehold, HOUSEHOLD_FILTER } from "../../database/scope.ts"
import { prepareAi } from "../ai/run.ts"
import { householdToday } from "../pantry/pantry.ts"
import { getTastes } from "../plan/preferences.ts"
import { addMessages, chatMessages, findChat } from "./chats.ts"
import {
  filesIn,
  fileUrl,
  readChatFile,
  withFiles,
  type ChatFileType,
} from "./files.ts"
import { contextText, systemPrompt, type PageContext } from "./prompt.ts"
import { assistantTools } from "./tools.ts"

// The assistant answering a message: the chat so far, what's on their
// screen, and the tools, streamed back as AI SDK's UI message stream. The
// person's message is kept at once, and the answer when it's done.

/** Enough for a few lookups and a proposal or two; stops runaway loops. */
const MOST_STEPS = 8

export type RespondDeps = Pick<
  AppDeps,
  "settings" | "fetcher" | "ai" | "files" | "database"
>

export async function respond(
  deps: RespondDeps,
  options: {
    householdId: string
    userId: string
    chatId: string
    text: string
    /** Photos and PDFs sent with it, uploaded first. */
    files?: readonly { id: string; name?: string }[]
    context?: PageContext
  }
): Promise<Response> {
  const { householdId, userId } = options
  const owner = { householdId, userId }
  const em = forHousehold(deps.database.em, householdId)
  const chat = await findChat(em, userId, options.chatId)
  const sent: { id: string; name?: string; mediaType: ChatFileType }[] = []
  for (const file of options.files ?? []) {
    if (sent.some((other) => other.id === file.id)) continue
    const kept = await readChatFile(deps.files, owner, file.id)
    if (!kept) {
      throw new AppError(
        "not_found",
        "file_not_found",
        "That file is gone. Add it again."
      )
    }
    sent.push({ ...file, mediaType: kept.mediaType })
  }
  const earlier = await chatMessages(em, chat)
  const types = new Set(
    [...filesIn(earlier), ...sent].map((file) => file.mediaType)
  )
  // Checked before anything's kept: no AI, no message.
  const ai = await prepareAi(deps, em, {
    householdId,
    userId,
    task: "assistant",
    needs: [
      "tools",
      ...(types.has("image/jpeg") ? (["images"] as const) : []),
      ...(types.has("application/pdf") ? (["pdfs"] as const) : []),
    ],
  })
  const [history, person, household, tastes, today, onScreen] =
    await Promise.all([
      earlier,
      em.findOneOrFail(User, { id: userId }),
      em.findOneOrFail(
        Household,
        { id: householdId },
        { filters: { [HOUSEHOLD_FILTER]: false } }
      ),
      getTastes(em, householdId),
      householdToday(em, householdId),
      contextText(em, options.context ?? {}),
    ])

  const message: UIMessage = {
    id: uuidv7(),
    role: "user",
    parts: [
      ...sent.map((file) => ({
        type: "file" as const,
        mediaType: file.mediaType,
        url: fileUrl(file.id),
        ...(file.name ? { filename: file.name } : {}),
      })),
      ...(options.text ? [{ type: "text" as const, text: options.text }] : []),
    ],
  }
  await addMessages(em, chat, [message])
  const messages = [...history, message]
  const tools = {
    ...assistantTools(deps, em, {
      householdId,
      userId,
      chatId: chat.id,
      files: sent,
    }),
    ...(ai.webSearch ?? {}),
  }
  const system = [
    systemPrompt({
      person: person.name,
      household: household.name,
      today,
      tastes,
      webSearch: ai.webSearch !== null,
    }),
    onScreen,
  ]
    .filter(Boolean)
    .join("\n\n")

  const result = streamText({
    model: ai.model,
    system,
    messages: await convertToModelMessages(
      await withFiles(deps.files, owner, messages),
      {
        tools,
        ignoreIncompleteToolCalls: true,
      }
    ),
    tools,
    stopWhen: stepCountIs(MOST_STEPS),
    onFinish: async ({ totalUsage }) => {
      await ai.finished(totalUsage)
    },
    onError: async ({ error }) => {
      await ai.failed(error)
    },
  })

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    generateMessageId: () => uuidv7(),
    onFinish: async ({ responseMessage }) => {
      if (responseMessage.parts.length === 0) return
      const later = forHousehold(deps.database.em, householdId)
      await addMessages(later, await findChat(later, userId, chat.id), [
        responseMessage,
      ])
    },
    onError: (error) => ai.explain(error),
  })
}

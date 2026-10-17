import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { getChat } from "../../../../../services/assistant/chats.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  ChatParam,
  ChatWithMessagesSchema,
} from "../../../../schemas/assistant.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/assistant/chats/{chatId}",
  operationId: "getChat",
  tags: ["Assistant"],
  summary: "A chat, with its messages",
  ...openToKeys("assistant", "read"),
  request: { params: ChatParam },
  responses: {
    200: jsonResponse(ChatWithMessagesSchema, "The chat."),
    404: errorResponse("No such chat of yours."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, userId } = inHousehold(c)
    const chat = await getChat(em, userId, c.req.valid("param").chatId)
    // AI SDK's message types run too deep for the schema's: they're kept as is.
    const messages = chat.messages as unknown as Record<string, unknown>[]
    return c.json({ ...chat, messages }, 200)
  })
}

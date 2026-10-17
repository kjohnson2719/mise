import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { startChat } from "../../../../services/assistant/chats.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { ChatSchema } from "../../../schemas/assistant.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/assistant/chats",
  operationId: "startChat",
  tags: ["Assistant"],
  summary: "Start a chat",
  description:
    "A new chat with the assistant, to send messages to at `POST /assistant/chats/{chatId}/messages`. Its first message names it.",
  ...openToKeys("assistant", "write"),
  responses: {
    201: jsonResponse(ChatSchema, "Started."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    return c.json(await startChat(em, { householdId, userId }), 201)
  })
}

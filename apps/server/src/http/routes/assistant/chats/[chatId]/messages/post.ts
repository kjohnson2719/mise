import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { respond } from "../../../../../../services/assistant/respond.ts"
import { inHousehold, openToKeys } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import {
  ChatMessageInputSchema,
  ChatParam,
} from "../../../../../schemas/assistant.ts"
import {
  errorResponse,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/assistant/chats/{chatId}/messages",
  operationId: "sendChatMessage",
  tags: ["Assistant"],
  summary: "Ask the assistant",
  description:
    "Sends a message, and streams the assistant's answer back as AI SDK's UI message stream (server-sent events), the way `useChat` reads it: its text, and the tools it uses as it uses them. It can see photos and PDFs sent with a message (uploaded first, with `POST /assistant/files`) when the model reads them, drafting a recipe from one, look things up in the household's recipes, plan, list and pantry, search the web when the model can, and propose changes, which come back as suggestions (`GET /proposals/{proposalId}`) for the person to apply. Both messages are kept. Uses the household's model for the assistant, which must be able to use tools, and counts towards its AI spend.",
  ...openToKeys("assistant", "write"),
  request: {
    params: ChatParam,
    body: {
      required: true,
      content: { "application/json": { schema: ChatMessageInputSchema } },
    },
  },
  responses: {
    200: {
      description: "The answer, as it comes.",
      content: {
        "text/event-stream": {
          schema: z.string().openapi({
            description: "AI SDK's UI message stream.",
          }),
        },
      },
    },
    404: errorResponse("No such chat of yours, or no such file."),
    422: errorResponse("The model can't use tools, or read photos or PDFs."),
    429: errorResponse("This month's AI limit is reached."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { householdId, userId } = inHousehold(c)
    const { text, files, context } = c.req.valid("json")
    const response = await respond(deps, {
      householdId,
      userId,
      chatId: c.req.valid("param").chatId,
      text,
      files,
      context,
    })
    return response as never
  })
}

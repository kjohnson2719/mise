import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { deleteChat } from "../../../../../services/assistant/chats.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { ChatParam } from "../../../../schemas/assistant.ts"
import {
  errorResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "delete",
  path: "/assistant/chats/{chatId}",
  operationId: "deleteChat",
  tags: ["Assistant"],
  summary: "Delete a chat",
  description:
    "Gone for good, with its messages and the files in them. What was applied from it stays.",
  ...openToKeys("assistant", "write"),
  request: { params: ChatParam },
  responses: {
    204: { description: "Deleted." },
    404: errorResponse("No such chat of yours."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { files }: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    await deleteChat(
      em,
      files,
      { householdId, userId },
      c.req.valid("param").chatId
    )
    return c.body(null, 204)
  })
}

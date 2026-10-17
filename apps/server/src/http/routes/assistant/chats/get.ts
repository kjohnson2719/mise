import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { listChats } from "../../../../services/assistant/chats.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { ChatListSchema } from "../../../schemas/assistant.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/assistant/chats",
  operationId: "listChats",
  tags: ["Assistant"],
  summary: "Your chats",
  description:
    "Your chats with the assistant in the household you're in, newest first. Nobody else's: each person's are their own.",
  ...openToKeys("assistant", "read"),
  responses: {
    200: jsonResponse(ChatListSchema, "Your chats."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, userId } = inHousehold(c)
    return c.json({ chats: await listChats(em, userId) }, 200)
  })
}

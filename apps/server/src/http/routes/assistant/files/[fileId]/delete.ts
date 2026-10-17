import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { removeChatFiles } from "../../../../../services/assistant/files.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { AssistantFileParam } from "../../../../schemas/assistant.ts"
import { SIGNED_IN_ERRORS } from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "delete",
  path: "/assistant/files/{fileId}",
  operationId: "deleteAssistantFile",
  tags: ["Assistant"],
  summary: "Delete a file sent to the assistant",
  description:
    "For one taken out of a message before it's sent. A message it's already in says it's gone. One that's already gone is fine.",
  ...openToKeys("assistant", "write"),
  request: { params: AssistantFileParam },
  responses: {
    204: { description: "Deleted." },
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { files }: AppDeps) => {
  router.openapi(route, async (c) => {
    const { householdId, userId } = inHousehold(c)
    await removeChatFiles(files, { householdId, userId }, [
      c.req.valid("param").fileId,
    ])
    return c.body(null, 204)
  })
}

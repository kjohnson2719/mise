import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { AppError } from "../../../../../core/errors.ts"
import { readChatFile } from "../../../../../services/assistant/files.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { AssistantFileParam } from "../../../../schemas/assistant.ts"
import {
  errorResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const binary = { schema: z.string().openapi({ format: "binary" }) }

const route = createRoute({
  method: "get",
  path: "/assistant/files/{fileId}",
  operationId: "getAssistantFile",
  tags: ["Assistant"],
  summary: "A file sent to the assistant",
  description:
    "A photo as JPEG, or a PDF. Only the person who sent it sees it, like their chats. A file never changes, so it can be kept for good.",
  ...openToKeys("assistant", "read"),
  request: { params: AssistantFileParam },
  responses: {
    200: {
      description: "The file.",
      content: { "image/jpeg": binary, "application/pdf": binary },
    },
    404: errorResponse("No such file of yours."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { files }: AppDeps) => {
  router.openapi(route, async (c) => {
    const { householdId, userId } = inHousehold(c)
    const file = await readChatFile(
      files,
      { householdId, userId },
      c.req.valid("param").fileId
    )
    if (!file) {
      throw new AppError("not_found", "file_not_found", "There's no such file.")
    }
    c.header("Content-Type", file.mediaType)
    c.header("Cache-Control", "private, max-age=31536000, immutable")
    // Opened in the browser, never run as a page of this site.
    c.header("Content-Disposition", "inline")
    c.header("X-Content-Type-Options", "nosniff")
    return c.body(new Uint8Array(file.body), 200)
  })
}

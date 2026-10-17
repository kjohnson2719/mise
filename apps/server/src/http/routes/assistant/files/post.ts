import { createRoute, z } from "@hono/zod-openapi"
import { bodyLimit } from "hono/body-limit"
import type { AppDeps } from "../../../../core/context.ts"
import { AppError } from "../../../../core/errors.ts"
import { storeChatFile } from "../../../../services/assistant/files.ts"
import { MAX_PHOTO_BYTES } from "../../../../services/recipes/photos.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { AssistantFileSchema, PDF_LIMIT } from "../../../schemas/assistant.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"

const keys = openToKeys("assistant", "write")

const tooBig = () =>
  new AppError(
    "too_large",
    "file_too_large",
    `That file is too big. Use a photo under 15 MB, or a PDF under ${PDF_LIMIT}.`
  )

const route = createRoute({
  method: "post",
  path: "/assistant/files",
  operationId: "uploadAssistantFile",
  tags: ["Assistant"],
  summary: "Add a photo or PDF for the assistant",
  description: `A file to send with a message, by its id in the message's \`files\`: a photo of what's in the pan, or a recipe to draft, as a photo or PDF. A photo is JPEG, PNG or WebP up to 15 MB, kept smaller and the right way up; a PDF is up to ${PDF_LIMIT}. They're kept with the person's chats.`,
  ...keys,
  middleware: [
    ...keys.middleware,
    bodyLimit({
      maxSize: MAX_PHOTO_BYTES,
      onError: () => {
        throw tooBig()
      },
    }),
  ] as const,
  request: {
    body: {
      required: true,
      content: {
        "multipart/form-data": {
          schema: z.object({
            // Checked here, to say what's wrong in words.
            file: z
              .any()
              .optional()
              .openapi({ type: "string", format: "binary" }),
          }),
        },
      },
    },
  },
  responses: {
    201: jsonResponse(AssistantFileSchema, "Kept."),
    400: errorResponse("No file, or not a photo or PDF Merran can read."),
    413: errorResponse("The file is too big."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { files }: AppDeps) => {
  router.openapi(route, async (c) => {
    const { householdId, userId } = inHousehold(c)
    const { file } = await c.req.parseBody()
    if (!(file instanceof File)) {
      throw new AppError("invalid", "no_file", "Add a photo or PDF.", {
        file: "Add a photo or PDF.",
      })
    }
    if (file.size > MAX_PHOTO_BYTES) throw tooBig()
    const kept = await storeChatFile(
      files,
      { householdId, userId },
      Buffer.from(await file.arrayBuffer())
    )
    return c.json(kept, 201)
  })
}

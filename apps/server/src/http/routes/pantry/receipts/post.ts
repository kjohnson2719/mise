import { createRoute, z } from "@hono/zod-openapi"
import { bodyLimit } from "hono/body-limit"
import type { AppDeps } from "../../../../core/context.ts"
import { AppError } from "../../../../core/errors.ts"
import {
  MAX_RECEIPT_FILES,
  readReceipt,
} from "../../../../services/receipts/receipts.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { ReceiptSchema } from "../../../schemas/receipts.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"

const keys = openToKeys("pantry", "write")

/** A few phone photos, or screenshots and a PDF. */
const MAX_BYTES = 40_000_000

const route = createRoute({
  method: "post",
  path: "/pantry/receipts",
  operationId: "scanReceipt",
  tags: ["Pantry"],
  summary: "Scan a receipt",
  description: `Reads a receipt into a draft to look over before anything goes in the pantry: photos of a paper one, screenshots or a PDF of an emailed one (up to ${MAX_RECEIPT_FILES} files, one \`file\` field each), or its \`text\`. Each line says what it is, how much, and the shopping list item it was bought for. Add it with \`POST /pantry/receipts/{receiptId}/add\`; it's forgotten after a day. Uses the household's model for receipts, which must be able to read photos or PDFs if those are sent, and counts towards its AI spend.`,
  ...keys,
  middleware: [
    ...keys.middleware,
    bodyLimit({
      maxSize: MAX_BYTES,
      onError: () => {
        throw new AppError(
          "too_large",
          "files_too_large",
          "Those files are too big together. Send fewer, or smaller photos."
        )
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
            file: z.any().optional().openapi({
              type: "string",
              format: "binary",
              description: "A photo, screenshot or PDF of the receipt.",
            }),
            text: z.string().optional().openapi({
              description: "The receipt's text, as from an email.",
            }),
          }),
        },
      },
    },
  },
  responses: {
    201: jsonResponse(ReceiptSchema, "Read, waiting for a look."),
    400: errorResponse("Nothing to read, or a file Merran can't read."),
    413: errorResponse("The files are too big."),
    422: errorResponse(
      "It isn't a receipt (`receipt_is_recipe` when it's a recipe), or the model can't read photos or PDFs."
    ),
    429: errorResponse("This month's AI limit is reached."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    const body = await c.req.parseBody({ all: true })
    const files = await Promise.all(
      [body.file ?? []]
        .flat()
        .filter((value): value is File => value instanceof File)
        .map(async (file) => ({
          body: Buffer.from(await file.arrayBuffer()),
          type: file.type,
        }))
    )
    const text = typeof body.text === "string" ? body.text : null
    const { what, receipt } = await readReceipt(em, deps, {
      householdId,
      userId,
      input: { files, text },
    })
    if (!receipt) {
      throw what === "recipe"
        ? new AppError(
            "unprocessable",
            "receipt_is_recipe",
            "That looks like a recipe, not a receipt."
          )
        : new AppError(
            "unprocessable",
            "not_a_receipt",
            "Merran couldn't find a receipt in that. Try a clearer photo, or paste its text."
          )
    }
    return c.json(receipt, 201)
  })
}

import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../../core/context.ts"
import { readReceiptFile } from "../../../../../../../services/receipts/receipts.ts"
import { inHousehold, openToKeys } from "../../../../../../middleware/auth.ts"
import type { Router } from "../../../../../../router.ts"
import { ReceiptFileParam } from "../../../../../../schemas/receipts.ts"
import {
  errorResponse,
  SIGNED_IN_ERRORS,
} from "../../../../../../schemas/responses.ts"

const binary = { schema: z.string().openapi({ format: "binary" }) }

const route = createRoute({
  method: "get",
  path: "/pantry/receipts/{receiptId}/files/{index}",
  operationId: "getReceiptFile",
  tags: ["Pantry"],
  summary: "A receipt's photo or PDF",
  description: "To compare with its lines while looking it over.",
  ...openToKeys("pantry", "read"),
  request: { params: ReceiptFileParam },
  responses: {
    200: {
      description: "The photo, as JPEG, or the PDF.",
      content: { "image/jpeg": binary, "application/pdf": binary },
    },
    404: errorResponse("No such receipt waiting, or no such file."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { files }: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const { receiptId, index } = c.req.valid("param")
    const file = await readReceiptFile(em, files, {
      householdId,
      receiptId,
      index: /^\d{1,2}$/.test(index) ? Number(index) : -1,
    })
    c.header("Content-Type", file.mediaType)
    c.header("Cache-Control", "private, max-age=86400")
    c.header("X-Content-Type-Options", "nosniff")
    return c.body(new Uint8Array(file.body), 200)
  })
}

import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { discardReceipt } from "../../../../../services/receipts/receipts.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { ReceiptParam } from "../../../../schemas/receipts.ts"
import {
  errorResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "delete",
  path: "/pantry/receipts/{receiptId}",
  operationId: "discardReceipt",
  tags: ["Pantry"],
  summary: "Discard a receipt",
  description: "Forgets it, with its photos, without adding anything.",
  ...openToKeys("pantry", "write"),
  request: { params: ReceiptParam },
  responses: {
    204: { description: "Discarded." },
    404: errorResponse("No such receipt waiting."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { files }: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    await discardReceipt(em, files, {
      householdId,
      receiptId: c.req.valid("param").receiptId,
    })
    return c.body(null, 204)
  })
}

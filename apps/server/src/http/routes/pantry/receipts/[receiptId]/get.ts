import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import {
  describeReceipt,
  findReceipt,
} from "../../../../../services/receipts/receipts.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { ReceiptParam, ReceiptSchema } from "../../../../schemas/receipts.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/pantry/receipts/{receiptId}",
  operationId: "getReceipt",
  tags: ["Pantry"],
  summary: "A receipt waiting for a look",
  description:
    "One scanned, shared or sent to the assistant, and not added or discarded yet.",
  ...openToKeys("pantry", "read"),
  request: { params: ReceiptParam },
  responses: {
    200: jsonResponse(ReceiptSchema, "The receipt."),
    404: errorResponse(
      "No such receipt waiting: added, discarded, or a day old."
    ),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    const receipt = await findReceipt(em, c.req.valid("param").receiptId)
    return c.json(describeReceipt(receipt), 200)
  })
}

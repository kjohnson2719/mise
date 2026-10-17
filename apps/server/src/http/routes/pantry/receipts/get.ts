import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { listReceipts } from "../../../../services/receipts/receipts.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { ReceiptListSchema } from "../../../schemas/receipts.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/pantry/receipts",
  operationId: "listReceipts",
  tags: ["Pantry"],
  summary: "Receipts waiting for a look",
  description:
    "Scanned, shared or sent to the assistant, and not added or discarded yet, newest first. Each is forgotten after a day.",
  ...openToKeys("pantry", "read"),
  responses: {
    200: jsonResponse(ReceiptListSchema, "The receipts."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    return c.json({ receipts: await listReceipts(em) }, 200)
  })
}

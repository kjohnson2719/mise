import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { addReceipt } from "../../../../../../services/receipts/receipts.ts"
import { inHousehold, openToKeys } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import {
  AddReceiptInputSchema,
  ReceiptAddedSchema,
  ReceiptParam,
} from "../../../../../schemas/receipts.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/pantry/receipts/{receiptId}/add",
  operationId: "addReceipt",
  tags: ["Pantry"],
  summary: "Put a receipt's lines in the pantry",
  description:
    "The lines picked, named and measured as looked over, go in the pantry like shopping put away: in the fridge, freezer or cupboard with a use-by guess, kept for the meals the list item was for, and noted for usual buys. The list items they were bought for come off the list. The receipt's done with after.",
  ...openToKeys("pantry", "write"),
  request: {
    params: ReceiptParam,
    body: {
      required: true,
      content: { "application/json": { schema: AddReceiptInputSchema } },
    },
  },
  responses: {
    200: jsonResponse(ReceiptAddedSchema, "Added."),
    404: errorResponse("No such receipt waiting."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { files }: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const result = await addReceipt(em, files, {
      householdId,
      receiptId: c.req.valid("param").receiptId,
      items: c.req.valid("json").items,
    })
    return c.json(result, 200)
  })
}

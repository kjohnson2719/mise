import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { removeItem } from "../../../../../services/pantry/pantry.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  PantryItemParam,
  PantrySnapshotSchema,
} from "../../../../schemas/pantry.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "delete",
  path: "/pantry/items/{itemId}",
  operationId: "removePantryItem",
  tags: ["Pantry"],
  summary: "Used up, or thrown out",
  description: "The answer is what it was, for Undo with /pantry/restore.",
  ...openToKeys("pantry", "write"),
  request: { params: PantryItemParam },
  responses: {
    200: jsonResponse(PantrySnapshotSchema, "Gone."),
    404: errorResponse("Not in the pantry."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    const { itemId } = c.req.valid("param")
    return c.json(await removeItem(em, itemId), 200)
  })
}

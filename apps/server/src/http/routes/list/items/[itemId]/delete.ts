import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { removeItem } from "../../../../../services/list/list.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { ItemParam, ListItemSnapshotSchema } from "../../../../schemas/list.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "delete",
  path: "/list/items/{itemId}",
  operationId: "removeListItem",
  tags: ["List"],
  summary: "Take something off the list",
  description: "The answer is what it was, for Undo with /list/restore.",
  ...openToKeys("list", "write"),
  request: { params: ItemParam },
  responses: {
    200: jsonResponse(ListItemSnapshotSchema, "Taken off."),
    404: errorResponse("Not on the list."),
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

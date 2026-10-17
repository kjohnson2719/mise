import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { updateItem } from "../../../../../services/list/list.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  ItemParam,
  ListItemChangesSchema,
  ListItemSchema,
} from "../../../../schemas/list.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "patch",
  path: "/list/items/{itemId}",
  operationId: "updateListItem",
  tags: ["List"],
  summary: "Change something on the list",
  description:
    "Check it off or not, rename it, change how much, or move it to another aisle or list, which the household remembers for the food.",
  ...openToKeys("list", "write"),
  request: {
    params: ItemParam,
    body: {
      required: true,
      content: { "application/json": { schema: ListItemChangesSchema } },
    },
  },
  responses: {
    200: jsonResponse(ListItemSchema, "Changed."),
    404: errorResponse("Not on the list, or no such aisle or list."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const { itemId } = c.req.valid("param")
    return c.json(
      await updateItem(em, householdId, itemId, c.req.valid("json")),
      200
    )
  })
}

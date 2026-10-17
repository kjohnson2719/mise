import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { restoreItems } from "../../../../services/list/list.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { ListItemsSchema, ListRestoreSchema } from "../../../schemas/list.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/list/restore",
  operationId: "restoreListItems",
  tags: ["List"],
  summary: "Put things on the list back as they were",
  description:
    "Undo: items as taking them off or changing them said they were. One taken off comes back with its id. An aisle that's gone is left empty.",
  ...openToKeys("list", "write"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: ListRestoreSchema } },
    },
  },
  responses: {
    200: jsonResponse(ListItemsSchema, "Back as they were."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const { items } = c.req.valid("json")
    return c.json({ items: await restoreItems(em, householdId, items) }, 200)
  })
}

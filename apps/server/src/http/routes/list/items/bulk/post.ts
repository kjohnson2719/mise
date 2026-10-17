import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { bulkItems } from "../../../../../services/list/list.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  ListBulkResultSchema,
  ListBulkSchema,
} from "../../../../schemas/list.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/list/items/bulk",
  operationId: "changeListItems",
  tags: ["List"],
  summary: "Change several things on the list at once",
  description:
    "Take them off, check them off or not, move them to an aisle or another list (remembered for each food), or buy them every week: all or none. The answer says what they were before, for Undo with /list/restore. Ids not on the list are passed over.",
  ...openToKeys("list", "write"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: ListBulkSchema } },
    },
  },
  responses: {
    200: jsonResponse(ListBulkResultSchema, "Done."),
    404: errorResponse("No such aisle or list."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const { ids, action, aisle, list } = c.req.valid("json")
    const result = await bulkItems(
      em,
      householdId,
      ids,
      action === "aisle"
        ? { action, aisle: aisle ?? null }
        : action === "move"
          ? { action, list: list! }
          : { action }
    )
    return c.json(result, 200)
  })
}

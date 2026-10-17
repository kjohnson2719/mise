import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { bulkItems } from "../../../../../services/pantry/pantry.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  PantryBulkResultSchema,
  PantryBulkSchema,
} from "../../../../schemas/pantry.ts"
import {
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/pantry/items/bulk",
  operationId: "changePantryItems",
  tags: ["Pantry"],
  summary: "Change several things at home at once",
  description:
    "Used up, moved to the fridge, freezer or cupboard, or given a use-by date (null for none): all or none. The answer says what they were before, for Undo with /pantry/restore. Ids not in the pantry are passed over.",
  ...openToKeys("pantry", "write"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: PantryBulkSchema } },
    },
  },
  responses: {
    200: jsonResponse(PantryBulkResultSchema, "Done."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const { ids, action, storedIn, useBy } = c.req.valid("json")
    const result = await bulkItems(
      em,
      householdId,
      ids,
      action === "storedIn"
        ? { action, storedIn: storedIn ?? null }
        : action === "useBy"
          ? { action, useBy: useBy ?? null }
          : { action }
    )
    return c.json(result, 200)
  })
}

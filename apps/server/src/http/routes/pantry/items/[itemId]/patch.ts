import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { updateItem } from "../../../../../services/pantry/pantry.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  PantryChangesSchema,
  PantryItemParam,
  PantryItemSchema,
} from "../../../../schemas/pantry.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "patch",
  path: "/pantry/items/{itemId}",
  operationId: "updatePantryItem",
  tags: ["Pantry"],
  summary: "Change something at home",
  description:
    "Rename it, change how much, where it's kept, its use-by date or its aisle. Moving it to the freezer takes its use-by date off, unless one's given.",
  ...openToKeys("pantry", "write"),
  request: {
    params: PantryItemParam,
    body: {
      required: true,
      content: { "application/json": { schema: PantryChangesSchema } },
    },
  },
  responses: {
    200: jsonResponse(PantryItemSchema, "Changed."),
    404: errorResponse("Not in the pantry, or no such aisle."),
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

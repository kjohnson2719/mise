import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { restoreItems } from "../../../../services/pantry/pantry.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import {
  PantryItemsSchema,
  PantryRestoreSchema,
} from "../../../schemas/pantry.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/pantry/restore",
  operationId: "restorePantryItems",
  tags: ["Pantry"],
  summary: "Put things at home back as they were",
  description:
    "Undo: things as using them up or changing them said they were. One used up comes back with its id. An aisle that's gone is left empty.",
  ...openToKeys("pantry", "write"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: PantryRestoreSchema } },
    },
  },
  responses: {
    200: jsonResponse(PantryItemsSchema, "Back as they were."),
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

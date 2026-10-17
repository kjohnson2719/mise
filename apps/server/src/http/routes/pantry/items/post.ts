import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { addTyped } from "../../../../services/pantry/pantry.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import {
  NewPantryItemSchema,
  PantryItemSchema,
} from "../../../schemas/pantry.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/pantry/items",
  operationId: "addPantryItem",
  tags: ["Pantry"],
  summary: "Put something in the pantry",
  description:
    'As typed: "2 lb chicken thighs" or just "rice". It goes in the fridge, freezer or cupboard as the food suggests, with a use-by guess for fresh food, and joins the same food already there when the amounts add up.',
  ...openToKeys("pantry", "write"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: NewPantryItemSchema } },
    },
  },
  responses: {
    201: jsonResponse(PantryItemSchema, "At home."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    return c.json(await addTyped(em, householdId, c.req.valid("json")), 201)
  })
}

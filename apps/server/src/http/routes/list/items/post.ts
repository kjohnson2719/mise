import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { addTyped } from "../../../../services/list/list.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { ListItemSchema, NewListItemSchema } from "../../../schemas/list.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/list/items",
  operationId: "addListItem",
  tags: ["List"],
  summary: "Put something on the list",
  description:
    'As typed: "2 lb ground beef" is ground beef, 2 lb; "paper towels" is just that. It goes in the aisle and on the list the household last put the food in, else a first guess and the list for that aisle.',
  ...openToKeys("list", "write"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: NewListItemSchema } },
    },
  },
  responses: {
    201: jsonResponse(ListItemSchema, "On the list."),
    404: errorResponse("No such aisle or list."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    return c.json(await addTyped(em, householdId, c.req.valid("json")), 201)
  })
}

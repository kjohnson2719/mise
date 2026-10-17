import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { keepApart } from "../../../../../../services/list/teach.ts"
import { inHousehold, openToKeys } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import {
  ItemParam,
  KeepApartSchema,
  KeptApartSchema,
} from "../../../../../schemas/list.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/list/items/{itemId}/apart",
  operationId: "keepListItemNamesApart",
  tags: ["List"],
  summary: "Say names a line was joined from aren't the same",
  description:
    "Each name is its own food for the household from the next list on (docs/foods.md). The line as it is stays.",
  ...openToKeys("list", "write"),
  request: {
    params: ItemParam,
    body: {
      required: true,
      content: { "application/json": { schema: KeepApartSchema } },
    },
  },
  responses: {
    200: jsonResponse(KeptApartSchema, "Remembered."),
    404: errorResponse("Not on the list."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const { itemId } = c.req.valid("param")
    const { names } = c.req.valid("json")
    return c.json(await keepApart(em, householdId, itemId, names), 200)
  })
}

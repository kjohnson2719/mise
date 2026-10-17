import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { addUsualBuys } from "../../../../../services/list/usual.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { UsualAddSchema } from "../../../../schemas/list.ts"
import {
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"
import { ListItemsSchema } from "../../../../schemas/list.ts"

const route = createRoute({
  method: "post",
  path: "/list/usual/add",
  operationId: "addUsualBuys",
  tags: ["List"],
  summary: "Put usual buys on the list",
  description:
    "As they were last bought, each in its aisle and on its list. Ones not due are passed over.",
  ...openToKeys("list", "write"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: UsualAddSchema } },
    },
  },
  responses: {
    201: jsonResponse(ListItemsSchema, "On the list."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const { foods } = c.req.valid("json")
    return c.json({ items: await addUsualBuys(em, householdId, foods) }, 201)
  })
}

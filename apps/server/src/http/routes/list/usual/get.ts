import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { dueUsualBuys } from "../../../../services/list/usual.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { UsualBuysSchema } from "../../../schemas/list.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/list/usual",
  operationId: "listUsualBuys",
  tags: ["List"],
  summary: "Usual buys due",
  description:
    "What the household gets every so often, learned from the shopping it's put away (bought on three days or more), now due again: \"Milk? You last got some Oct 9.\" Not what's on the list, at home, bought every week or always on hand, nor what's been passed over until it's due again.",
  ...openToKeys("list", "read"),
  responses: {
    200: jsonResponse(UsualBuysSchema, "Due now."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    return c.json({ items: await dueUsualBuys(em, householdId) }, 200)
  })
}

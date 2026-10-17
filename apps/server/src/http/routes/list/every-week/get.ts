import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { listEveryWeek } from "../../../../services/list/every-week.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { EveryWeekSchema } from "../../../schemas/list.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/list/every-week",
  operationId: "listEveryWeek",
  tags: ["List"],
  summary: "What's bought every week",
  description:
    "Bought whatever's planned (bananas, milk). Adding from the plan puts those not on the list on it.",
  ...openToKeys("list", "read"),
  responses: {
    200: jsonResponse(EveryWeekSchema, "The every-week items."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    return c.json({ items: await listEveryWeek(em) }, 200)
  })
}

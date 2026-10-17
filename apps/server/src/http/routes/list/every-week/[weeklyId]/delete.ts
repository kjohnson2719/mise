import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { removeEveryWeekItem } from "../../../../../services/list/every-week.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { EveryWeekParam } from "../../../../schemas/list.ts"
import {
  errorResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "delete",
  path: "/list/every-week/{weeklyId}",
  operationId: "removeEveryWeekItem",
  tags: ["List"],
  summary: "Stop buying something every week",
  description: "What's on the list now stays.",
  ...openToKeys("list", "write"),
  request: { params: EveryWeekParam },
  responses: {
    204: { description: "Not bought every week any more." },
    404: errorResponse("Not bought every week."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    const { weeklyId } = c.req.valid("param")
    await removeEveryWeekItem(em, weeklyId)
    return c.body(null, 204)
  })
}

import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { updateEveryWeekItem } from "../../../../../services/list/every-week.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  EveryWeekChangesSchema,
  EveryWeekItemSchema,
  EveryWeekParam,
} from "../../../../schemas/list.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "patch",
  path: "/list/every-week/{weeklyId}",
  operationId: "updateEveryWeekItem",
  tags: ["List"],
  summary: "Change something bought every week",
  ...openToKeys("list", "write"),
  request: {
    params: EveryWeekParam,
    body: {
      required: true,
      content: { "application/json": { schema: EveryWeekChangesSchema } },
    },
  },
  responses: {
    200: jsonResponse(EveryWeekItemSchema, "Changed."),
    404: errorResponse("Not bought every week."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    const { weeklyId } = c.req.valid("param")
    return c.json(
      await updateEveryWeekItem(em, weeklyId, c.req.valid("json")),
      200
    )
  })
}

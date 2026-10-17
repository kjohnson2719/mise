import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { addEveryWeekItem } from "../../../../services/list/every-week.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import {
  EveryWeekItemSchema,
  NewEveryWeekItemSchema,
} from "../../../schemas/list.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/list/every-week",
  operationId: "addEveryWeekItem",
  tags: ["List"],
  summary: "Buy something every week",
  ...openToKeys("list", "write"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: NewEveryWeekItemSchema } },
    },
  },
  responses: {
    201: jsonResponse(EveryWeekItemSchema, "Bought every week now."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    return c.json(
      await addEveryWeekItem(em, householdId, c.req.valid("json")),
      201
    )
  })
}

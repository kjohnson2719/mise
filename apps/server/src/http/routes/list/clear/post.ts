import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { clearList } from "../../../../services/list/list.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { ClearListSchema, ListBeforeSchema } from "../../../schemas/list.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/list/clear",
  operationId: "clearList",
  tags: ["List"],
  summary: "Clear the list",
  description:
    "Takes off what's checked, or everything. The answer says what was there, for Undo with /list/restore.",
  ...openToKeys("list", "write"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: ClearListSchema } },
    },
  },
  responses: {
    200: jsonResponse(ListBeforeSchema, "Cleared."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const { which } = c.req.valid("json")
    return c.json(await clearList(em, householdId, which), 200)
  })
}

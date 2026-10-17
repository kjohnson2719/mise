import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { putAway } from "../../../../services/pantry/put-away.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { PutAwayResultSchema, PutAwaySchema } from "../../../schemas/pantry.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/list/put-away",
  operationId: "putAway",
  tags: ["List"],
  summary: "Put the shopping away",
  description:
    "What's checked off (on a list, or all of them) goes in the pantry: set aside for the meals it was bought for, in the fridge, freezer or cupboard, with a use-by guess for fresh food. Household things and what's always on hand are cleared without going in. Everything bought goes in the purchase history.",
  ...openToKeys("list", "write"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: PutAwaySchema } },
    },
  },
  responses: {
    200: jsonResponse(PutAwayResultSchema, "Put away."),
    404: errorResponse("No such list."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    return c.json(await putAway(em, householdId, c.req.valid("json")), 200)
  })
}

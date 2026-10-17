import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { joinedNames } from "../../../../../../services/list/teach.ts"
import { inHousehold, openToKeys } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import { ItemParam, JoinedNamesSchema } from "../../../../../schemas/list.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/list/items/{itemId}/names",
  operationId: "listItemNames",
  tags: ["List"],
  summary: "What a line on the list was joined from",
  description:
    "Its own name, and the names in its meals' recipes that came to the same food: what Not the same can keep apart.",
  ...openToKeys("list", "read"),
  request: { params: ItemParam },
  responses: {
    200: jsonResponse(JoinedNamesSchema, "The names."),
    404: errorResponse("Not on the list."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    const { itemId } = c.req.valid("param")
    return c.json({ names: await joinedNames(em, itemId) }, 200)
  })
}

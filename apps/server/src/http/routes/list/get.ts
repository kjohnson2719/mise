import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../core/context.ts"
import { getList } from "../../../services/list/list.ts"
import { inHousehold, openToKeys } from "../../middleware/auth.ts"
import type { Router } from "../../router.ts"
import { ShoppingListSchema } from "../../schemas/list.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/list",
  operationId: "getList",
  tags: ["List"],
  summary: "The shopping lists",
  description:
    "The household's lists (one for each store it shops at, the main one first), and everything to buy, by aisle in a walk through the store, with what's checked off. Each item says which list it's on, how much, and which planned meals it's for.",
  ...openToKeys("list", "read"),
  responses: {
    200: jsonResponse(ShoppingListSchema, "The list."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    return c.json(await getList(em, householdId), 200)
  })
}

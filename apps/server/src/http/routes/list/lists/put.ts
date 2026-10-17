import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { saveLists } from "../../../../services/list/lists.ts"
import { asHouseholdAdmin } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { ListsInputSchema, ListsSchema } from "../../../schemas/list.ts"
import {
  errorResponse,
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"

const route = createRoute({
  method: "put",
  path: "/list/lists",
  operationId: "saveLists",
  tags: ["List"],
  summary: "Change the household's lists",
  description:
    "Household admins only. The lists as a whole, in order: one with no id is new, and one left out goes, with what's on it moving to the main list, which has to stay. Each store has one list, and each aisle goes on one. Then what's waiting on the main list moves to the list its food or aisle goes on now.",
  security: SESSION_SECURITY,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: ListsInputSchema } },
    },
  },
  responses: {
    200: jsonResponse(ListsSchema, "Saved."),
    400: errorResponse(
      "The main list left out, too many lists, a store twice or an aisle on two lists."
    ),
    404: errorResponse("No such list or aisle."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = asHouseholdAdmin(c)
    const { lists } = c.req.valid("json")
    return c.json({ lists: await saveLists(em, householdId, lists) }, 200)
  })
}

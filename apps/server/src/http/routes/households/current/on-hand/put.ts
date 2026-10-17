import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { saveOnHand } from "../../../../../services/list/every-week.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { OnHandSchema } from "../../../../schemas/list.ts"
import {
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "put",
  path: "/households/current/on-hand",
  operationId: "setOnHand",
  tags: ["Households"],
  summary: "Change what the household always has",
  description:
    'Anyone in the household can. Saved tidied: lowercase, without repeats, and "salt and pepper" as salt and pepper.',
  ...openToKeys("list", "write"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: OnHandSchema } },
    },
  },
  responses: {
    200: jsonResponse(OnHandSchema, "Saved."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const { items } = c.req.valid("json")
    return c.json({ items: await saveOnHand(em, householdId, items) }, 200)
  })
}

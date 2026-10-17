import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { setKrogerStore } from "../../../../services/stores/connections.ts"
import { checkPricesSoon } from "../../../../services/stores/prices.ts"
import { asHouseholdAdmin } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import {
  errorResponse,
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"
import {
  KrogerStoreChangesSchema,
  StoresStatusSchema,
} from "../../../schemas/stores.ts"

const route = createRoute({
  method: "put",
  path: "/stores/kroger",
  operationId: "setKrogerStore",
  tags: ["Stores"],
  summary: "Pick the household's Kroger store",
  description:
    "Household admins only. The store the household shops at (from `GET /stores/kroger/locations`), and whether orders are picked up or delivered. A new store has its prices and sales checked straight away.",
  security: SESSION_SECURITY,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: KrogerStoreChangesSchema } },
    },
  },
  responses: {
    200: jsonResponse(StoresStatusSchema, "Its stores now."),
    404: errorResponse("No such Kroger store."),
    422: errorResponse("Kroger isn't set up on this server."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = asHouseholdAdmin(c)
    const changes = c.req.valid("json")
    const status = await setKrogerStore(deps, em, householdId, changes)
    if (changes.locationId) await checkPricesSoon(em, householdId)
    return c.json(status, 200)
  })
}

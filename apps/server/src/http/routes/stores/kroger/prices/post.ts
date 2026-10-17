import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { checkPrices } from "../../../../../services/stores/prices.ts"
import { asHouseholdAdmin } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  errorResponse,
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"
import { PriceCheckSchema } from "../../../../schemas/stores.ts"

const route = createRoute({
  method: "post",
  path: "/stores/kroger/prices",
  operationId: "checkKrogerPrices",
  tags: ["Stores"],
  summary: "Check prices now",
  description:
    "Household admins only. What's done each morning by itself: today's prices for the products the household keeps, and a look at the store for foods its recipes use, for their sales.",
  security: SESSION_SECURITY,
  responses: {
    200: jsonResponse(PriceCheckSchema, "Checked."),
    422: errorResponse("Kroger isn't set up, or there's no store picked."),
    429: errorResponse("Kroger's daily limit for the app is used up."),
    502: errorResponse("Kroger didn't answer."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = asHouseholdAdmin(c)
    return c.json(await checkPrices(deps, em, householdId), 200)
  })
}

import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { Household } from "../../../../database/entities/index.ts"
import { asHouseholdAdmin } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import {
  describeHousehold,
  HouseholdChangesSchema,
  HouseholdSchema,
} from "../../../schemas/households.ts"
import {
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"

const route = createRoute({
  method: "patch",
  path: "/households/current",
  operationId: "updateHousehold",
  tags: ["Households"],
  summary: "Change the household",
  description: "Household admins only.",
  security: SESSION_SECURITY,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: HouseholdChangesSchema } },
    },
  },
  responses: {
    200: jsonResponse(HouseholdSchema, "Changed."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { householdId, role, em } = asHouseholdAdmin(c)
    const household = await em.findOneOrFail(Household, householdId)
    const { meals, ...changes } = c.req.valid("json")
    em.assign(household, changes)
    // The meals it plans live with its other planning settings.
    if (meals) household.settings = { ...household.settings, meals }
    await em.flush()
    return c.json(describeHousehold(household, role), 200)
  })
}

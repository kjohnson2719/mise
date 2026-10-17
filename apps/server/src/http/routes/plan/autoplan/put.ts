import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { saveAutoplan } from "../../../../services/plan/autoplan.ts"
import { asHouseholdAdmin } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import {
  AutoplanSchema,
  AutoplanSettingsSchema,
} from "../../../schemas/plan.ts"
import {
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"

const route = createRoute({
  method: "put",
  path: "/plan/autoplan",
  operationId: "saveAutoplan",
  tags: ["Plan"],
  summary: "Change the weekly autoplan",
  description:
    "Household admins only. On its day and hour it fills the week ahead's empty meals the way Fill the week does, saying why for each, and can put what they need on the list. Turning it on plans nothing straight away: it waits for its day and hour. A run that's late, with the server off, plans what's left of its week.",
  security: SESSION_SECURITY,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: AutoplanSettingsSchema } },
    },
  },
  responses: {
    200: jsonResponse(AutoplanSchema, "Saved."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = asHouseholdAdmin(c)
    return c.json(await saveAutoplan(em, householdId, c.req.valid("json")), 200)
  })
}

import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { asHouseholdAdmin } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import {
  errorResponse,
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"
import {
  HouseholdSettingsSchema,
  SettingChangesSchema,
} from "../../../schemas/settings.ts"

const route = createRoute({
  method: "patch",
  path: "/settings/household",
  operationId: "updateHouseholdSettings",
  tags: ["Settings"],
  summary: "Change the household's settings",
  description:
    "Household admins only. Send only what changes. Nothing is saved if anything is wrong.",
  security: SESSION_SECURITY,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: SettingChangesSchema } },
    },
  },
  responses: {
    200: jsonResponse(HouseholdSettingsSchema, "Saved."),
    400: errorResponse("Something isn't right, field by field."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { settings }: AppDeps) => {
  router.openapi(route, async (c) => {
    const { householdId, userId } = asHouseholdAdmin(c)
    await settings.saveHousehold(
      c.var.em,
      householdId,
      c.req.valid("json"),
      userId
    )
    return c.json(
      { settings: await settings.describeHousehold(c.var.em, householdId) },
      200
    )
  })
}

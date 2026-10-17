import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { inHousehold } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import {
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"
import { HouseholdSettingsSchema } from "../../../schemas/settings.ts"

const route = createRoute({
  method: "get",
  path: "/settings/household",
  operationId: "getHouseholdSettings",
  tags: ["Settings"],
  summary: "The household's settings",
  description:
    "The settings of the household in use, like its own AI keys. Anyone in the household can see them; secrets show only whether they're set.",
  security: SESSION_SECURITY,
  responses: {
    200: jsonResponse(HouseholdSettingsSchema, "The settings."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { settings }: AppDeps) => {
  router.openapi(route, async (c) => {
    const { householdId } = inHousehold(c)
    return c.json(
      { settings: await settings.describeHousehold(c.var.em, householdId) },
      200
    )
  })
}

import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { saveThemes } from "../../../../../services/plan/preferences.ts"
import { asHouseholdAdmin } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { ThemeNightsSchema } from "../../../../schemas/plan.ts"
import {
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "put",
  path: "/households/current/themes",
  operationId: "setThemeNights",
  tags: ["Households"],
  summary: "Change the household's theme nights",
  description: "Household admins only. Replaces the whole week.",
  security: SESSION_SECURITY,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: ThemeNightsSchema } },
    },
  },
  responses: {
    200: jsonResponse(ThemeNightsSchema, "Saved."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = asHouseholdAdmin(c)
    const { themes } = c.req.valid("json")
    return c.json({ themes: await saveThemes(em, householdId, themes) }, 200)
  })
}

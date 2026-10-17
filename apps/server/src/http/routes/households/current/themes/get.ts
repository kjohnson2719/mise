import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { getThemes } from "../../../../../services/plan/preferences.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { ThemeNightsSchema } from "../../../../schemas/plan.ts"
import {
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/households/current/themes",
  operationId: "getThemeNights",
  tags: ["Households"],
  summary: "The household's theme nights",
  description:
    "Dinner's theme each weekday, Sunday first: taco night, fish on Friday, eat out on Saturday. Fill the week keeps to them.",
  ...openToKeys("plan", "read"),
  responses: {
    200: jsonResponse(ThemeNightsSchema, "Its theme nights."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    return c.json({ themes: await getThemes(em, householdId) }, 200)
  })
}

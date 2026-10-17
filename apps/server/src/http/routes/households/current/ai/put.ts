import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { saveHouseholdAi } from "../../../../../services/ai/status.ts"
import { householdAiView } from "../../../../../services/ai/views.ts"
import { asHouseholdAdmin } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  HouseholdAiSchema,
  HouseholdAiSettingsSchema,
} from "../../../../schemas/ai.ts"
import {
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "put",
  path: "/households/current/ai",
  operationId: "saveHouseholdAi",
  tags: ["AI"],
  summary: "Pick the household's AI models",
  description:
    "Household admins only. Its models for big and small tasks, and for any task of its own; null goes by its keys, or the server's. And a monthly limit on its own keys.",
  security: SESSION_SECURITY,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: HouseholdAiSettingsSchema } },
    },
  },
  responses: {
    200: jsonResponse(HouseholdAiSchema, "Saved."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { householdId } = asHouseholdAdmin(c)
    await saveHouseholdAi(c.var.em, householdId, c.req.valid("json"))
    return c.json(await householdAiView(deps, c.var.em, householdId), 200)
  })
}

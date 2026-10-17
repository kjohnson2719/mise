import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { householdAiView } from "../../../../../services/ai/views.ts"
import { inHousehold, signedIn } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { HouseholdAiSchema } from "../../../../schemas/ai.ts"
import {
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/households/current/ai",
  operationId: "getHouseholdAi",
  tags: ["AI"],
  summary: "The household's AI",
  description:
    "Anyone in the household. For each AI task, the model and whose key pays, the household's or the server's, or why there's none; this month's spend against the limits; its own keys and addresses (only their last four characters); the models it can pick; and what it's spent by month, task and person.",
  security: SESSION_SECURITY,
  responses: {
    200: jsonResponse(HouseholdAiSchema, "The household's AI."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    signedIn(c)
    const { householdId } = inHousehold(c)
    return c.json(await householdAiView(deps, c.var.em, householdId), 200)
  })
}

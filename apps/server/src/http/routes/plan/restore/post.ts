import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { restoreEntries } from "../../../../services/plan/plan.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { PlanRestoreSchema, PlanSchema } from "../../../schemas/plan.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/plan/restore",
  operationId: "restorePlanEntries",
  tags: ["Plan"],
  summary: "Put meals back as they were",
  description:
    "Undo: meals as other changes said they were. Ones taken off come back with the same id; ones changed go back to how they were. A meal whose recipe is gone is passed over.",
  ...openToKeys("plan", "write"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: PlanRestoreSchema } },
    },
  },
  responses: {
    200: jsonResponse(PlanSchema, "As they were."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const entries = await restoreEntries(
      em,
      householdId,
      c.req.valid("json").entries
    )
    return c.json({ entries }, 200)
  })
}

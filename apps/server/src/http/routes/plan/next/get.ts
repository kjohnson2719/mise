import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { whatsNext } from "../../../../services/plan/plan.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { WhatsNextSchema } from "../../../schemas/plan.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/plan/next",
  operationId: "getWhatsNext",
  tags: ["Plan"],
  summary: "What's next",
  description:
    "The next meal still planned, by the household's clock: today's from the meal of the hour on (breakfast until 11, lunch until 3, then dinner), then the days after. Snacks and the week's pool aren't counted.",
  ...openToKeys("plan", "read"),
  responses: {
    200: jsonResponse(WhatsNextSchema, "What's next."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    return c.json(await whatsNext(em, householdId), 200)
  })
}

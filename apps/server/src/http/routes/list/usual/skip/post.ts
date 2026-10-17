import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { skipUsualBuy } from "../../../../../services/list/usual.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { UsualSkipSchema } from "../../../../schemas/list.ts"
import { SIGNED_IN_ERRORS } from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/list/usual/skip",
  operationId: "skipUsualBuy",
  tags: ["List"],
  summary: "Not this time",
  description: "A usual buy isn't offered again until it's next due.",
  ...openToKeys("list", "write"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: UsualSkipSchema } },
    },
  },
  responses: {
    204: { description: "Passed over." },
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    await skipUsualBuy(em, householdId, c.req.valid("json").food)
    return c.body(null, 204)
  })
}

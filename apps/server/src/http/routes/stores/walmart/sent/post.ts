import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { walmartSent } from "../../../../../services/stores/walmart.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"
import { SentSchema } from "../../../../schemas/stores.ts"
import { WalmartSentSchema } from "../../../../schemas/walmart.ts"

const route = createRoute({
  method: "post",
  path: "/stores/walmart/sent",
  operationId: "walmartSent",
  tags: ["Stores"],
  summary: "What the extension put in the Walmart cart",
  description:
    "Remembered as sent while it's still on the list, so it's left unticked next time, and its product kept as the household's, as its page showed it. The extension adds to the cart in the person's own Walmart tab; this only records it.",
  ...openToKeys("list", "write"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: WalmartSentSchema } },
    },
  },
  responses: {
    200: jsonResponse(SentSchema, "Remembered."),
    422: errorResponse("Walmart isn't turned on on this server."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const { lines } = c.req.valid("json")
    return c.json(await walmartSent(deps, em, householdId, lines), 200)
  })
}

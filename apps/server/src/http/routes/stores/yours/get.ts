import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { yourStores } from "../../../../services/stores/yours.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../../schemas/responses.ts"
import { YourStoresSchema } from "../../../schemas/stores.ts"

const route = createRoute({
  method: "get",
  path: "/stores/yours",
  operationId: "yourStores",
  tags: ["Stores"],
  summary: "The stores the household shops at",
  description:
    "For Find on the list: its Kroger store when it has one and Walmart when the server has it on, which Merran can find products at and send to, then the stores it picked in Settings (`stores.yours`), whose sites can be searched.",
  ...openToKeys("list", "read"),
  responses: {
    200: jsonResponse(YourStoresSchema, "The household's stores."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    return c.json({ stores: await yourStores(deps, em, householdId) }, 200)
  })
}

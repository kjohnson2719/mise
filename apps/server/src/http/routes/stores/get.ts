import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../core/context.ts"
import { storesStatus } from "../../../services/stores/connections.ts"
import { inHousehold, openToKeys } from "../../middleware/auth.ts"
import type { Router } from "../../router.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../schemas/responses.ts"
import { StoresStatusSchema } from "../../schemas/stores.ts"

const route = createRoute({
  method: "get",
  path: "/stores",
  operationId: "getStores",
  tags: ["Stores"],
  summary: "The household's stores",
  description:
    "Kroger for the household: whether the server has a Kroger app, the household's store, how orders are collected, and the account linked to send things to its cart.",
  ...openToKeys("list", "read"),
  responses: {
    200: jsonResponse(StoresStatusSchema, "Its stores."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    return c.json(await storesStatus(deps, em, householdId), 200)
  })
}

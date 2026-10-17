import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { startKrogerLink } from "../../../../../services/stores/connections.ts"
import { asHouseholdAdmin } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  errorResponse,
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"
import { LinkSchema } from "../../../../schemas/stores.ts"

const route = createRoute({
  method: "post",
  path: "/stores/kroger/link",
  operationId: "startKrogerLink",
  tags: ["Stores"],
  summary: "Link a Kroger account",
  description:
    "Household admins only. Where to send the person to let Merran add to their Kroger cart; Kroger sends them back to `GET /stores/kroger/callback`. One account for the household, so everyone shops one cart.",
  security: SESSION_SECURITY,
  responses: {
    200: jsonResponse(LinkSchema, "Where to go."),
    422: errorResponse("Kroger isn't set up on this server."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = asHouseholdAdmin(c)
    const origin = deps.config.publicUrl ?? new URL(c.req.url).origin
    const url = await startKrogerLink(deps, em, {
      householdId,
      userId,
      redirectUri: `${origin}/api/stores/kroger/callback`,
    })
    return c.json({ url }, 200)
  })
}

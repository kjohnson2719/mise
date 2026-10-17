import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { unlinkKroger } from "../../../../../services/stores/connections.ts"
import { asHouseholdAdmin } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "delete",
  path: "/stores/kroger/link",
  operationId: "unlinkKroger",
  tags: ["Stores"],
  summary: "Unlink the Kroger account",
  description: "Household admins only. Its tokens are deleted.",
  security: SESSION_SECURITY,
  responses: {
    204: { description: "Unlinked." },
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = asHouseholdAdmin(c)
    await unlinkKroger(em)
    return c.body(null, 204)
  })
}

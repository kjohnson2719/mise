import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import {
  checkForUpdates,
  describeUpdates,
} from "../../../../../../modules/updates/check.ts"
import { serverAdmin } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import {
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"
import { UpdatesSchema } from "../../../../../schemas/settings.ts"

const route = createRoute({
  method: "post",
  path: "/settings/server/updates/check",
  operationId: "checkForUpdates",
  tags: ["Settings"],
  summary: "Look for a newer Merran now",
  description:
    "Server admins only. Asks GitHub for Merran's releases now, rather than at the next 6-hourly look, and answers with what it found. Does nothing for a build that isn't a release, or when MERRAN_UPDATE_CHECK says no.",
  security: SESSION_SECURITY,
  responses: {
    200: jsonResponse(UpdatesSchema, "What the update check found."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    serverAdmin(c)
    await checkForUpdates(deps, c.var.em)
    return c.json(await describeUpdates(deps), 200)
  })
}

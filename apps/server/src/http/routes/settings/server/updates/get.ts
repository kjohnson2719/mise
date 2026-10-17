import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { describeUpdates } from "../../../../../modules/updates/check.ts"
import { serverAdmin } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"
import { UpdatesSchema } from "../../../../schemas/settings.ts"

const route = createRoute({
  method: "get",
  path: "/settings/server/updates",
  operationId: "getUpdates",
  tags: ["Settings"],
  summary: "Is there a newer Merran?",
  description:
    "Server admins only. The version running and the newest release the update check found on GitHub (it looks every 6 hours), with its notes, and whether it's newer.",
  security: SESSION_SECURITY,
  responses: {
    200: jsonResponse(UpdatesSchema, "What the update check found."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    serverAdmin(c)
    return c.json(await describeUpdates(deps), 200)
  })
}

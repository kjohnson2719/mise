import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { serverAdmin } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import {
  errorResponse,
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"
import {
  ServerSettingsSchema,
  SettingChangesSchema,
} from "../../../schemas/settings.ts"
import { describeServerSettings } from "./get.ts"

const route = createRoute({
  method: "patch",
  path: "/settings/server",
  operationId: "updateServerSettings",
  tags: ["Settings"],
  summary: "Change the server's settings",
  description:
    "Server admins only. Send only what changes. Nothing is saved if anything is wrong, and settings from environment variables can't be changed.",
  security: SESSION_SECURITY,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: SettingChangesSchema } },
    },
  },
  responses: {
    200: jsonResponse(ServerSettingsSchema, "Saved."),
    400: errorResponse("Something isn't right, field by field."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { user } = serverAdmin(c)
    await deps.settings.saveServer(c.var.em, c.req.valid("json"), user.id)
    return c.json(await describeServerSettings(deps), 200)
  })
}

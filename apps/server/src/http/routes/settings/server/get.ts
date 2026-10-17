import { createRoute } from "@hono/zod-openapi"
import { existsSync } from "node:fs"
import { join } from "node:path"
import type { AppDeps } from "../../../../core/context.ts"
import { VIDEO } from "../../../../modules/video/settings.ts"
import { shelfSummary } from "../../../../services/sites/sites.ts"
import { serverAdmin } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import {
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"
import { ServerSettingsSchema } from "../../../schemas/settings.ts"

const route = createRoute({
  method: "get",
  path: "/settings/server",
  operationId: "getServerSettings",
  tags: ["Settings"],
  summary: "The server's settings",
  description:
    "Server admins only. Every server setting that can be seen here, with where its value comes from, and a little about the server.",
  security: SESSION_SECURITY,
  responses: {
    200: jsonResponse(ServerSettingsSchema, "The settings."),
    ...SIGNED_IN_ERRORS,
  },
})

/** The server's settings, as GET and PATCH /api/settings/server answer. */
export async function describeServerSettings({
  config,
  settings,
  video,
  database,
}: AppDeps) {
  const tools = await video.check()
  const cookies =
    (await settings.server(VIDEO.cookiesFile)) ??
    join(config.dataDir, "cookies.txt")
  return {
    about: {
      version: config.version,
      installMethod: config.installMethod,
      database: config.database.kind,
      publicUrl: config.publicUrl ?? null,
    },
    settings: await settings.describeServer(),
    video: { ...tools, cookies: existsSync(cookies) },
    sites: await shelfSummary(database.em.fork()),
    kroger: {
      // Without a public address, the web app says its own.
      redirectUri: config.publicUrl
        ? `${config.publicUrl}/api/stores/kroger/callback`
        : null,
    },
  }
}

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    serverAdmin(c)
    return c.json(await describeServerSettings(deps), 200)
  })
}

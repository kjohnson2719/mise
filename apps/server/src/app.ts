import { Scalar } from "@scalar/hono-api-reference"
import { requestId } from "hono/request-id"
import { secureHeaders } from "hono/secure-headers"
import type { AppDeps } from "./core/context.ts"
import { ErrorSchema, handleError, handleNotFound } from "./http/errors.ts"
import { entityManager } from "./http/middleware/entity-manager.ts"
import { requestLogger } from "./http/middleware/request-logger.ts"
import { authenticateRequests } from "./http/middleware/auth.ts"
import { announceChanges } from "./http/middleware/live.ts"
import {
  clientAddress,
  trustedProxies,
} from "./http/middleware/client-address.ts"
import {
  buildOpenApiDocument,
  DEFAULT_SERVER_URL,
} from "./http/openapi/document.ts"
import { createRouter } from "./http/router.ts"
import routes from "./http/routes/index.ts"
import { serveWebApp } from "./http/web-app.ts"

export const API_BASE = "/api"
const SPEC_PATH = `${API_BASE}/openapi.json`

export function createApp(deps: AppDeps) {
  const app = createRouter()

  app.use(requestId())
  app.use(clientAddress(trustedProxies(deps.config.trustedProxies)))
  app.use(secureHeaders())
  app.use(requestLogger(deps.logger))
  app.use(entityManager(deps.database))
  app.use(authenticateRequests(deps.auth))
  app.use(announceChanges(deps.events))

  const api = createRouter()
  routes(api, deps)
  app.route(API_BASE, api)

  app.openAPIRegistry.register("Error", ErrorSchema)
  app.openAPIRegistry.registerComponent("securitySchemes", "session", {
    type: "apiKey",
    in: "cookie",
    name: "merran.session_token",
    description: "The cookie that signing in sets.",
  })
  app.openAPIRegistry.registerComponent("securitySchemes", "apiKey", {
    type: "http",
    scheme: "bearer",
    bearerFormat: "mrn_…",
    description:
      "An API key, made at POST /api/auth/api-keys, sent as `Authorization: Bearer mrn_…`. It acts as its person in one household, with only the permissions it was given.",
  })
  // Built once, on first request, since the routes don't change while running.
  let spec: ReturnType<typeof buildOpenApiDocument> | undefined
  app.get(SPEC_PATH, async (c) => {
    spec ??= buildOpenApiDocument(app, deps.auth, {
      version: deps.config.version,
      serverUrl: deps.config.publicUrl ?? DEFAULT_SERVER_URL,
    })
    return c.json(await spec)
  })
  app.get(
    `${API_BASE}/docs`,
    Scalar({
      url: SPEC_PATH,
      pageTitle: "Merran API",
      // Scalar reports usage to its makers unless told not to.
      telemetry: false,
      showDeveloperTools: "never",
      withDefaultFonts: false,
    })
  )

  if (deps.config.webDir) serveWebApp(app, deps.config.webDir, deps.logger)

  app.notFound(handleNotFound)
  app.onError(handleError)
  return app
}

export type App = ReturnType<typeof createApp>

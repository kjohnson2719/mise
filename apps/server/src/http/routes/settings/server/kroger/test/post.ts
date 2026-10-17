import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { AppError } from "../../../../../../core/errors.ts"
import { STORE_SETTINGS } from "../../../../../../modules/stores/settings.ts"
import {
  appToken,
  forgetKrogerTokens,
} from "../../../../../../services/stores/kroger.ts"
import { serverAdmin } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import {
  errorResponse,
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"
import {
  KrogerAppTestedSchema,
  KrogerAppTestSchema,
} from "../../../../../schemas/stores.ts"

const route = createRoute({
  method: "post",
  path: "/settings/server/kroger/test",
  operationId: "testKrogerApp",
  tags: ["Settings"],
  summary: "Test the Kroger app",
  description:
    "Server admins only. Asks Kroger for a token with a client ID and secret, before saving them, or with the saved ones.",
  security: SESSION_SECURITY,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: KrogerAppTestSchema } },
    },
  },
  responses: {
    200: jsonResponse(KrogerAppTestedSchema, "Kroger took them."),
    400: errorResponse("No client ID and secret to test."),
    422: errorResponse("Kroger refused them."),
    502: errorResponse("Kroger didn't answer."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { settings, fetcher }: AppDeps) => {
  router.openapi(route, async (c) => {
    serverAdmin(c)
    const given = c.req.valid("json")
    const clientId =
      given.clientId ?? (await settings.server(STORE_SETTINGS.krogerClientId))
    const clientSecret =
      given.clientSecret ??
      (await settings.server(STORE_SETTINGS.krogerClientSecret))
    if (!clientId || !clientSecret) {
      throw new AppError(
        "invalid",
        "no_kroger_app",
        "Add the Kroger app's client ID and secret to test them."
      )
    }
    forgetKrogerTokens()
    await appToken(fetcher, { clientId, clientSecret })
    return c.json({ ok: true as const }, 200)
  })
}

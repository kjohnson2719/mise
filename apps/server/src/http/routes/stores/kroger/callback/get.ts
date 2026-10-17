import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { AppError } from "../../../../../core/errors.ts"
import { finishKrogerLink } from "../../../../../services/stores/connections.ts"
import { signedIn } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"
import { CallbackQuery } from "../../../../schemas/stores.ts"

const route = createRoute({
  method: "get",
  path: "/stores/kroger/callback",
  operationId: "krogerCallback",
  tags: ["Stores"],
  summary: "Where Kroger sends the person back",
  description:
    "Not called directly: the redirect address the Kroger developer app has. It finishes linking the account, then sends the person on to Settings, Household, saying how it went.",
  security: SESSION_SECURITY,
  request: { query: CallbackQuery },
  responses: {
    302: { description: "On to Settings, Household." },
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { user } = signedIn(c)
    const { code, state, error } = c.req.valid("query")
    const back = (outcome: string, reason?: string) =>
      c.redirect(
        `/settings/household?kroger=${outcome}${reason ? `&reason=${encodeURIComponent(reason)}` : ""}`,
        302
      ) as never
    if (error || !code || !state) return back("cancelled")
    try {
      await finishKrogerLink(deps, c.var.em, {
        userId: user.id,
        state,
        code,
      })
      return back("linked")
    } catch (err) {
      if (!(err instanceof AppError)) {
        c.var.logger.error({ err }, "Linking a Kroger account failed")
      }
      return back(
        "failed",
        err instanceof AppError ? err.message : "Kroger didn't link."
      )
    }
  })
}

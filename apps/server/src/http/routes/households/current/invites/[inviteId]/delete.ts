import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { InviteLink } from "../../../../../../database/entities/index.ts"
import { AppError } from "../../../../../../core/errors.ts"
import { asHouseholdAdmin } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import { InviteParam } from "../../../../../schemas/households.ts"
import {
  errorResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"

const route = createRoute({
  method: "delete",
  path: "/households/current/invites/{inviteId}",
  operationId: "cancelInvite",
  tags: ["Households"],
  summary: "Cancel an invite link",
  description: "Household admins only.",
  security: SESSION_SECURITY,
  request: { params: InviteParam },
  responses: {
    204: { description: "Cancelled." },
    404: errorResponse("No such invite."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = asHouseholdAdmin(c)
    const removed = await em.nativeDelete(InviteLink, {
      id: c.req.valid("param").inviteId,
      usedAt: null,
    })
    if (removed === 0) {
      throw new AppError(
        "not_found",
        "invite_not_found",
        "There's no such invite."
      )
    }
    return c.body(null, 204)
  })
}

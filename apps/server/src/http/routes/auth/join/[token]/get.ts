import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { findUsableInvite } from "../../../../../services/auth/invites.ts"
import type { Router } from "../../../../router.ts"
import { InviteSchema, InviteTokenParam } from "../../../../schemas/auth.ts"
import { errorResponse, jsonResponse } from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/auth/join/{token}",
  operationId: "getInvite",
  tags: ["Sign-in"],
  summary: "See an invite",
  description: "Which household an invite link is for, before joining.",
  request: { params: InviteTokenParam },
  responses: {
    200: jsonResponse(InviteSchema, "The invite can be used."),
    404: errorResponse("No invite has that link."),
    410: errorResponse("The link has been used, or has expired."),
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const invite = await findUsableInvite(c.var.em, c.req.valid("param").token)
    return c.json(
      {
        household: { name: invite.household.getEntity().name },
        role: invite.role,
        expiresAt: invite.expiresAt.toISOString(),
      },
      200
    )
  })
}

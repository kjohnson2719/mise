import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { InviteLink } from "../../../../../database/entities/index.ts"
import { asHouseholdAdmin } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  describeInviteLink,
  InviteLinkSchema,
} from "../../../../schemas/households.ts"
import {
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/households/current/invites",
  operationId: "listInvites",
  tags: ["Households"],
  summary: "Invite links that can still be used",
  description:
    "Household admins only. The links themselves can't be shown again.",
  security: SESSION_SECURITY,
  responses: {
    200: jsonResponse(z.array(InviteLinkSchema), "Unused links, newest first."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = asHouseholdAdmin(c)
    const invites = await em.find(
      InviteLink,
      { usedAt: null, expiresAt: { $gt: new Date() } },
      { orderBy: { createdAt: "desc" } }
    )
    return c.json(invites.map(describeInviteLink), 200)
  })
}

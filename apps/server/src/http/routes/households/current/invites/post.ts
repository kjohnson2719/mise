import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { INVITE_ROLES } from "../../../../../database/entities/index.ts"
import { createInviteLink } from "../../../../../services/auth/invites.ts"
import { asHouseholdAdmin } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  describeInviteLink,
  NewInviteLinkSchema,
} from "../../../../schemas/households.ts"
import {
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/households/current/invites",
  operationId: "createInvite",
  tags: ["Households"],
  summary: "Make an invite link",
  description:
    "Household admins only. The link works once, for 7 days. Send it to the person; it's shown only now.",
  security: SESSION_SECURITY,
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z
            .object({ role: z.enum(INVITE_ROLES).default("member") })
            .openapi({ example: { role: "member" } }),
        },
      },
    },
  },
  responses: {
    201: jsonResponse(NewInviteLinkSchema, "Made."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { config }: AppDeps) => {
  router.openapi(route, async (c) => {
    const { householdId, em, userId } = asHouseholdAdmin(c)
    const { invite, token } = await createInviteLink(em, {
      householdId,
      role: c.req.valid("json").role,
      createdBy: userId,
    })
    const base = config.publicUrl ?? new URL(c.req.url).origin
    return c.json(
      { ...describeInviteLink(invite), link: `${base}/join/${token}` },
      201
    )
  })
}

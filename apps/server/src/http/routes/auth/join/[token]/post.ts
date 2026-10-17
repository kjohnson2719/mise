import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { Session } from "../../../../../database/entities/index.ts"
import {
  createAccount,
  signInCookies,
} from "../../../../../services/auth/accounts.ts"
import {
  acceptInvite,
  findUsableInvite,
} from "../../../../../services/auth/invites.ts"
import { AppError } from "../../../../../core/errors.ts"
import type { Router } from "../../../../router.ts"
import {
  describeMe,
  InviteTokenParam,
  MeSchema,
  NewAccountSchema,
  type NewAccount,
} from "../../../../schemas/auth.ts"
import { NEW_ACCOUNT } from "../../../../schemas/examples.ts"
import { errorResponse, jsonResponse } from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/auth/join/{token}",
  operationId: "joinHousehold",
  tags: ["Sign-in"],
  summary: "Join a household",
  description:
    "Signed in, this adds you to the invite's household. Signed out, send `account` to make one, which then signs in.",
  request: {
    params: InviteTokenParam,
    body: {
      required: false,
      content: {
        "application/json": {
          schema: z
            .object({ account: NewAccountSchema.optional() })
            .openapi("JoinRequest", { example: { account: NEW_ACCOUNT } }),
        },
      },
    },
  },
  responses: {
    200: jsonResponse(MeSchema, "Joined, with an account you already had."),
    201: jsonResponse(MeSchema, "Joined, with a new account, and signed in."),
    400: errorResponse("Signed out, and no account was sent."),
    404: errorResponse("No invite has that link."),
    409: errorResponse("Already in the household, or the account exists."),
    410: errorResponse("The link has been used, or has expired."),
  },
})

export default (router: Router, { auth }: AppDeps) => {
  router.openapi(route, async (c) => {
    const invite = await findUsableInvite(c.var.em, c.req.valid("param").token)
    const householdId = invite.household.id

    if (c.var.user && c.var.session) {
      await acceptInvite(c.var.em, invite, c.var.user.id)
      await c.var.em.nativeUpdate(
        Session,
        { id: c.var.session.id },
        { activeHousehold: householdId }
      )
      return c.json(await describeMe(c.var.em, c.var.user, householdId), 200)
    }

    // Already checked against NewAccountSchema when it was sent.
    const account = (c.req.valid("json") as { account?: NewAccount })?.account
    if (!account) {
      throw new AppError(
        "invalid",
        "account_needed",
        "Sign in, or make an account to join."
      )
    }

    const user = await createAccount(auth, c.var.em, account)
    await acceptInvite(c.var.em, invite, user.id)
    for (const cookie of await signInCookies(auth, account, c.req.raw)) {
      c.header("Set-Cookie", cookie, { append: true })
    }
    return c.json(await describeMe(c.var.em, user, householdId), 201)
  })
}

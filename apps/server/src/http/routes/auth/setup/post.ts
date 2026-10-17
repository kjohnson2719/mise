import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { User } from "../../../../database/entities/index.ts"
import {
  createAccount,
  signInCookies,
} from "../../../../services/auth/accounts.ts"
import { createHousehold } from "../../../../services/households.ts"
import { AppError } from "../../../../core/errors.ts"
import type { Router } from "../../../router.ts"
import {
  describeMe,
  MeSchema,
  NewAccountSchema,
} from "../../../schemas/auth.ts"
import { errorResponse, jsonResponse } from "../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/auth/setup",
  operationId: "setUpServer",
  tags: ["Sign-in"],
  summary: "Set up the server",
  description:
    "Makes the first account, which is the server admin, and its household, then signs in. Needs the setup code printed in the server's log.",
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: NewAccountSchema.extend({
            code: z.string().min(1, "Enter the setup code."),
            household: z
              .string()
              .trim()
              .min(1, "Name your household.")
              .max(100),
          }).openapi("SetupRequest", {
            example: {
              name: "Sam Rivera",
              email: "sam@example.com",
              username: "sam",
              password: "correct horse battery staple",
              code: "ABCD-EFGH-JKMN",
              household: "The Riveras",
            },
          }),
        },
      },
    },
  },
  responses: {
    201: jsonResponse(MeSchema, "Set up, and signed in."),
    400: errorResponse("Something's wrong with what was sent, or the code."),
    409: errorResponse("The server's already set up."),
    429: errorResponse("Too many wrong codes. Try again in a few minutes."),
  },
})

export default (router: Router, { auth, setupCode }: AppDeps) => {
  router.openapi(route, async (c) => {
    const body = c.req.valid("json")
    if ((await c.var.em.count(User)) > 0 || !setupCode.active) {
      throw new AppError(
        "conflict",
        "already_set_up",
        "This server is already set up."
      )
    }
    if (setupCode.locked) {
      throw new AppError(
        "rate_limited",
        "too_many_tries",
        "Too many wrong codes. Try again in a few minutes."
      )
    }
    if (!setupCode.check(body.code)) {
      throw new AppError(
        "invalid",
        "wrong_setup_code",
        "That code isn't right.",
        {
          code: "That code isn't right. It's in the server's log.",
        }
      )
    }

    const user = await createAccount(auth, c.var.em, body, {
      serverAdmin: true,
    })
    const household = await createHousehold(c.var.em, {
      name: body.household,
      ownerId: user.id,
    })
    setupCode.retire()
    c.var.logger.info("The server is set up")

    for (const cookie of await signInCookies(auth, body, c.req.raw)) {
      c.header("Set-Cookie", cookie, { append: true })
    }
    return c.json(await describeMe(c.var.em, user, household.id), 201)
  })
}

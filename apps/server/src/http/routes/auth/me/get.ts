import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { signedIn } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { describeMe, MeSchema } from "../../../schemas/auth.ts"
import {
  errorResponse,
  jsonResponse,
  SESSION_SECURITY,
} from "../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/auth/me",
  operationId: "getMe",
  tags: ["Sign-in"],
  summary: "Who's signed in",
  description:
    "The signed-in person, their households and the one in use on this device. Switch households with `POST /api/auth/organization/set-active`.",
  security: SESSION_SECURITY,
  responses: {
    200: jsonResponse(MeSchema, "Signed in."),
    401: errorResponse("Not signed in."),
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { user } = signedIn(c)
    return c.json(
      await describeMe(c.var.em, user, c.var.household?.id ?? null),
      200
    )
  })
}

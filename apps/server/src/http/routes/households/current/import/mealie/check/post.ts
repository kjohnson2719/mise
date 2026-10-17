import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../../core/context.ts"
import { alreadyFromMealie } from "../../../../../../../services/importers/job.ts"
import { checkMealie } from "../../../../../../../services/importers/mealie/server.ts"
import {
  asHouseholdAdmin,
  serverAdmin,
} from "../../../../../../middleware/auth.ts"
import type { Router } from "../../../../../../router.ts"
import {
  MealieCheckSchema,
  MealieConnectionSchema,
} from "../../../../../../schemas/imports.ts"
import {
  errorResponse,
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/households/current/import/mealie/check",
  operationId: "checkMealie",
  tags: ["Households"],
  summary: "Connect to a Mealie",
  description:
    "The server admin only, since Mealie is usually on the home network and this reaches the address given. Says which Mealie it is and how many recipes it has. The token isn't kept.",
  security: SESSION_SECURITY,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: MealieConnectionSchema } },
    },
  },
  responses: {
    200: jsonResponse(MealieCheckSchema, "Connected."),
    400: errorResponse("Mealie didn't take the token."),
    502: errorResponse("Couldn't reach Mealie, or it isn't Mealie."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { fetcher }: AppDeps) => {
  router.openapi(route, async (c) => {
    serverAdmin(c)
    const { em } = asHouseholdAdmin(c)
    const { url, token } = c.req.valid("json")
    const found = await checkMealie(fetcher, url, token)
    return c.json({ ...found, alreadyHere: await alreadyFromMealie(em) }, 200)
  })
}

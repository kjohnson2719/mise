import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../core/context.ts"
import { Session } from "../../../database/entities/index.ts"
import { createHousehold } from "../../../services/households.ts"
import { serverAdmin } from "../../middleware/auth.ts"
import type { Router } from "../../router.ts"
import {
  describeHousehold,
  HouseholdNameSchema,
  HouseholdSchema,
} from "../../schemas/households.ts"
import {
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/households",
  operationId: "createHousehold",
  tags: ["Households"],
  summary: "Start another household",
  description:
    "Server admins only, for now. You become its owner, and it becomes the one in use on this device.",
  security: SESSION_SECURITY,
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z
            .object({ name: HouseholdNameSchema })
            .openapi({ example: { name: "Grandma's kitchen" } }),
        },
      },
    },
  },
  responses: {
    201: jsonResponse(HouseholdSchema, "Started."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { user, session } = serverAdmin(c)
    const household = await createHousehold(c.var.em, {
      name: c.req.valid("json").name,
      ownerId: user.id,
    })
    await c.var.em.nativeUpdate(
      Session,
      { id: session.id },
      { activeHousehold: household.id }
    )
    return c.json(describeHousehold(household, "owner"), 201)
  })
}

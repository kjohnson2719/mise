import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { HOUSEHOLD_ROLES } from "../../../../../../database/entities/index.ts"
import {
  assertOwnerRemains,
  findMember,
} from "../../../../../../services/households.ts"
import { AppError } from "../../../../../../core/errors.ts"
import { asHouseholdAdmin } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import {
  describeMember,
  MemberParam,
  MemberSchema,
} from "../../../../../schemas/households.ts"
import {
  errorResponse,
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"

const route = createRoute({
  method: "patch",
  path: "/households/current/members/{memberId}",
  operationId: "updateMember",
  tags: ["Households"],
  summary: "Change someone's role",
  description:
    "Household admins only. Only owners can make or unmake owners, and there's always at least one owner.",
  security: SESSION_SECURITY,
  request: {
    params: MemberParam,
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z
            .object({ role: z.enum(HOUSEHOLD_ROLES) })
            .openapi({ example: { role: "admin" } }),
        },
      },
    },
  },
  responses: {
    200: jsonResponse(MemberSchema, "Changed."),
    404: errorResponse("No such person in the household."),
    409: errorResponse("That would leave no owner."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { role: myRole, em } = asHouseholdAdmin(c)
    const { role } = c.req.valid("json")
    const member = await findMember(em, c.req.valid("param").memberId)
    if ((role === "owner" || member.role === "owner") && myRole !== "owner") {
      throw new AppError(
        "forbidden",
        "not_owner",
        "Only an owner can make or unmake owners."
      )
    }
    await assertOwnerRemains(em, member, role)
    member.role = role
    await em.flush()
    return c.json(describeMember(member), 200)
  })
}

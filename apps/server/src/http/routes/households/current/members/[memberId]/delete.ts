import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { HouseholdMember } from "../../../../../../database/entities/index.ts"
import {
  assertOwnerRemains,
  findMember,
  isAdminRole,
} from "../../../../../../services/households.ts"
import { AppError } from "../../../../../../core/errors.ts"
import { inHousehold } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import { MemberParam } from "../../../../../schemas/households.ts"
import {
  errorResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"

const route = createRoute({
  method: "delete",
  path: "/households/current/members/{memberId}",
  operationId: "removeMember",
  tags: ["Households"],
  summary: "Remove someone, or leave",
  description:
    "Household admins can remove people; anyone can remove themselves. The last owner can't leave.",
  security: SESSION_SECURITY,
  request: { params: MemberParam },
  responses: {
    204: { description: "Removed." },
    404: errorResponse("No such person in the household."),
    409: errorResponse("That would leave no owner."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { role: myRole, em, userId } = inHousehold(c)
    const member = await findMember(em, c.req.valid("param").memberId)
    const leaving = member.user.id === userId
    if (!leaving) {
      if (!isAdminRole(myRole)) {
        throw new AppError(
          "forbidden",
          "not_household_admin",
          "Only the household's admins can do that."
        )
      }
      if (member.role === "owner" && myRole !== "owner") {
        throw new AppError(
          "forbidden",
          "not_owner",
          "Only an owner can remove an owner."
        )
      }
    }
    await assertOwnerRemains(em, member, null)
    await em.nativeDelete(HouseholdMember, { id: member.id })
    return c.body(null, 204)
  })
}

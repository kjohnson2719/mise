import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { HouseholdMember } from "../../../../../database/entities/index.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { describeMember, MemberSchema } from "../../../../schemas/households.ts"
import {
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/households/current/members",
  operationId: "listMembers",
  tags: ["Households"],
  summary: "Who's in the household",
  ...openToKeys("household", "read"),
  responses: {
    200: jsonResponse(
      z.array(MemberSchema),
      "Its people, longest-standing first."
    ),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    const members = await em.find(
      HouseholdMember,
      {},
      { populate: ["user"], orderBy: { createdAt: "asc" } }
    )
    return c.json(members.map(describeMember), 200)
  })
}

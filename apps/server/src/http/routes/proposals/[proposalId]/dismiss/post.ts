import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { dismissProposal } from "../../../../../services/recipes/review/proposals.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"
import { ProposalParam, ProposalSchema } from "../../../../schemas/tidy.ts"

const route = createRoute({
  method: "post",
  path: "/proposals/{proposalId}/dismiss",
  operationId: "dismissProposal",
  tags: ["Review"],
  summary: "Dismiss a suggestion",
  description: "The recipe stays as it is.",
  ...openToKeys("recipes", "write"),
  request: { params: ProposalParam },
  responses: {
    200: jsonResponse(ProposalSchema, "Dismissed."),
    404: errorResponse("No such suggestion."),
    409: errorResponse("Applied or dismissed already."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, userId } = inHousehold(c)
    const proposal = await dismissProposal(em, {
      userId,
      proposalId: c.req.valid("param").proposalId,
    })
    return c.json(proposal, 200)
  })
}

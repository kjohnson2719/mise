import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { getProposal } from "../../../../services/recipes/review/proposals.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"
import { ProposalParam, ProposalSchema } from "../../../schemas/tidy.ts"

const route = createRoute({
  method: "get",
  path: "/proposals/{proposalId}",
  operationId: "getProposal",
  tags: ["Review"],
  summary: "A suggestion",
  description: "Waiting, applied or dismissed.",
  ...openToKeys("recipes", "read"),
  request: { params: ProposalParam },
  responses: {
    200: jsonResponse(ProposalSchema, "The suggestion."),
    404: errorResponse("No such suggestion."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    return c.json(await getProposal(em, c.req.valid("param").proposalId), 200)
  })
}

import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../core/context.ts"
import { listProposals } from "../../../services/recipes/review/proposals.ts"
import { inHousehold, openToKeys } from "../../middleware/auth.ts"
import type { Router } from "../../router.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../schemas/responses.ts"
import {
  ProposalListQuerySchema,
  ProposalListSchema,
} from "../../schemas/tidy.ts"

const route = createRoute({
  method: "get",
  path: "/proposals",
  operationId: "listProposals",
  tags: ["Review"],
  summary: "The Review queue",
  description:
    "What AI suggests, waiting to be applied or dismissed, newest first, a page at a time.",
  ...openToKeys("recipes", "read"),
  request: { query: ProposalListQuerySchema },
  responses: {
    200: jsonResponse(ProposalListSchema, "What's waiting."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    return c.json(await listProposals(em, c.req.valid("query")), 200)
  })
}

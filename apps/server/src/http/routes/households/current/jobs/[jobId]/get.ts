import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { describeJob, findJob } from "../../../../../../services/jobs/jobs.ts"
import { asHouseholdAdmin } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import { JobParam, JobSchema } from "../../../../../schemas/jobs.ts"
import {
  errorResponse,
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/households/current/jobs/{jobId}",
  operationId: "getHouseholdJob",
  tags: ["Households"],
  summary: "One of the household's jobs",
  description:
    "Household admins only. How a job for this household, like an import, is getting on.",
  security: SESSION_SECURITY,
  request: { params: JobParam },
  responses: {
    200: jsonResponse(JobSchema, "The job."),
    404: errorResponse("No such job in this household."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { householdId } = asHouseholdAdmin(c)
    const job = await findJob(c.var.em, c.req.valid("param").jobId, householdId)
    return c.json(describeJob(job), 200)
  })
}

import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../../core/context.ts"
import {
  cancelJob,
  describeJob,
  findJob,
} from "../../../../../../../services/jobs/jobs.ts"
import { asHouseholdAdmin } from "../../../../../../middleware/auth.ts"
import type { Router } from "../../../../../../router.ts"
import { JobParam, JobSchema } from "../../../../../../schemas/jobs.ts"
import {
  errorResponse,
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/households/current/jobs/{jobId}/cancel",
  operationId: "cancelHouseholdJob",
  tags: ["Households"],
  summary: "Stop one of the household's jobs",
  description:
    "Household admins only. What it already did stays: an import keeps the recipes it brought in.",
  security: SESSION_SECURITY,
  request: { params: JobParam },
  responses: {
    200: jsonResponse(JobSchema, "Cancelled, or stopping."),
    404: errorResponse("No such job in this household."),
    409: errorResponse("It has already finished."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { jobs }: AppDeps) => {
  router.openapi(route, async (c) => {
    const { householdId } = asHouseholdAdmin(c)
    const job = await findJob(c.var.em, c.req.valid("param").jobId, householdId)
    await cancelJob(c.var.em, job, (id) => jobs.stopJob(id))
    return c.json(describeJob(job), 200)
  })
}

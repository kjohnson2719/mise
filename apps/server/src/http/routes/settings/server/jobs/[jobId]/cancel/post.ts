import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../../core/context.ts"
import {
  cancelJob,
  describeJob,
  findJob,
} from "../../../../../../../services/jobs/jobs.ts"
import { serverAdmin } from "../../../../../../middleware/auth.ts"
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
  path: "/settings/server/jobs/{jobId}/cancel",
  operationId: "cancelServerJob",
  tags: ["Settings"],
  summary: "Stop a job",
  description:
    "Server admins only. A waiting job is cancelled; a running one is asked to stop, and is cancelled once it has.",
  security: SESSION_SECURITY,
  request: { params: JobParam },
  responses: {
    200: jsonResponse(JobSchema, "Cancelled, or stopping."),
    404: errorResponse("No such job."),
    409: errorResponse("It has already finished."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { jobs }: AppDeps) => {
  router.openapi(route, async (c) => {
    serverAdmin(c)
    const job = await findJob(c.var.em, c.req.valid("param").jobId, null)
    await cancelJob(c.var.em, job, (id) => jobs.stopJob(id))
    return c.json(describeJob(job), 200)
  })
}

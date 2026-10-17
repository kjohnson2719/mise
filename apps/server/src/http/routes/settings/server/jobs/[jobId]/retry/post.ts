import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../../core/context.ts"
import {
  describeJob,
  findJob,
  retryJob,
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
  path: "/settings/server/jobs/{jobId}/retry",
  operationId: "retryServerJob",
  tags: ["Settings"],
  summary: "Try a job again",
  description:
    "Server admins only. A failed or cancelled job runs again from the start.",
  security: SESSION_SECURITY,
  request: { params: JobParam },
  responses: {
    200: jsonResponse(JobSchema, "Waiting to run."),
    404: errorResponse("No such job."),
    409: errorResponse(
      "It hasn't finished, or another like it is already waiting."
    ),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    serverAdmin(c)
    const job = await findJob(c.var.em, c.req.valid("param").jobId, null)
    return c.json(describeJob(await retryJob(c.var.em, job)), 200)
  })
}

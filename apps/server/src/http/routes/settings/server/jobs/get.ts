import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { listJobs } from "../../../../../services/jobs/jobs.ts"
import { serverAdmin } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { JobListQuerySchema, JobListSchema } from "../../../../schemas/jobs.ts"
import {
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/settings/server/jobs",
  operationId: "listServerJobs",
  tags: ["Settings"],
  summary: "The server's jobs",
  description:
    "Server admins only. The latest 100 jobs, newest first: what's waiting, running, done, or failed and why.",
  security: SESSION_SECURITY,
  request: { query: JobListQuerySchema },
  responses: {
    200: jsonResponse(JobListSchema, "The jobs."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    serverAdmin(c)
    const { status } = c.req.valid("query")
    return c.json({ jobs: await listJobs(c.var.em, { status }) }, 200)
  })
}

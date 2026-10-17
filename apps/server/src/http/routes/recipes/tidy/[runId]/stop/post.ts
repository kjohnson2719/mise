import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { cancelJob } from "../../../../../../services/jobs/jobs.ts"
import {
  describeTidyRun,
  findTidyRun,
} from "../../../../../../services/recipes/review/tidy-run.ts"
import { inHousehold, openToKeys } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"
import { TidyRunParam, TidyRunSchema } from "../../../../../schemas/tidy.ts"

const route = createRoute({
  method: "post",
  path: "/recipes/tidy/{runId}/stop",
  operationId: "stopTidyRun",
  tags: ["Review"],
  summary: "Stop a tidy up run",
  description:
    "The suggestions it made stay in Review. The recipe it's on finishes first, so the answer may still say it's running.",
  ...openToKeys("recipes", "write"),
  request: { params: TidyRunParam },
  responses: {
    200: jsonResponse(TidyRunSchema, "Stopped, or stopping."),
    404: errorResponse("No such run in this household."),
    409: errorResponse("It has already finished."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { jobs }: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const job = await findTidyRun(em, c.req.valid("param").runId, householdId)
    await cancelJob(em, job, (id) => jobs.stopJob(id))
    return c.json(describeTidyRun(job), 200)
  })
}

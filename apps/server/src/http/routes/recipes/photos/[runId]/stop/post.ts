import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import {
  describePhotoRun,
  findPhotoRun,
} from "../../../../../../services/ai-photos/runs.ts"
import { cancelJob } from "../../../../../../services/jobs/jobs.ts"
import { inHousehold, openToKeys } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import { PhotoRunParam, PhotoRunSchema } from "../../../../../schemas/photos.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/recipes/photos/{runId}/stop",
  operationId: "stopPhotoRun",
  tags: ["Recipes"],
  summary: "Stop making AI photos",
  description:
    "The photos made stay. The one being made finishes first, so the answer may still say it's running.",
  ...openToKeys("recipes", "write"),
  request: { params: PhotoRunParam },
  responses: {
    200: jsonResponse(PhotoRunSchema, "Stopped, or stopping."),
    404: errorResponse("No such run in this household."),
    409: errorResponse("It has already finished."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { jobs }: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const job = await findPhotoRun(em, c.req.valid("param").runId, householdId)
    await cancelJob(em, job, (id) => jobs.stopJob(id))
    return c.json(describePhotoRun(job), 200)
  })
}

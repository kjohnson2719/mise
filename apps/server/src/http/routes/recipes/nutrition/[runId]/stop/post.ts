import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { cancelJob } from "../../../../../../services/jobs/jobs.ts"
import {
  describeNutritionRun,
  findNutritionRun,
} from "../../../../../../services/nutrition/runs.ts"
import { inHousehold, openToKeys } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import {
  NutritionRunParam,
  NutritionRunSchema,
} from "../../../../../schemas/nutrition.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/recipes/nutrition/{runId}/stop",
  operationId: "stopNutritionRun",
  tags: ["Recipes"],
  summary: "Stop working out nutrition",
  description:
    "What it worked out stays. The recipe it's on finishes first, so the answer may still say it's running.",
  ...openToKeys("recipes", "write"),
  request: { params: NutritionRunParam },
  responses: {
    200: jsonResponse(NutritionRunSchema, "Stopped, or stopping."),
    404: errorResponse("No such run in this household."),
    409: errorResponse("It has already finished."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { jobs }: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const job = await findNutritionRun(
      em,
      c.req.valid("param").runId,
      householdId
    )
    await cancelJob(em, job, (id) => jobs.stopJob(id))
    return c.json(describeNutritionRun(job), 200)
  })
}

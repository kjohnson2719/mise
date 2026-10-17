import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import {
  tidyRuns,
  untidiedCount,
} from "../../../../services/recipes/review/tidy-run.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../../schemas/responses.ts"
import { TidyRunsSchema } from "../../../schemas/tidy.ts"

const route = createRoute({
  method: "get",
  path: "/recipes/tidy",
  operationId: "listTidyRuns",
  tags: ["Review"],
  summary: "Tidy up runs",
  description:
    "The household's runs that tidy many recipes: going, or finished in the last day, newest first, with how far each got and what it found. And how many recipes are still to tidy.",
  ...openToKeys("recipes", "read"),
  responses: {
    200: jsonResponse(TidyRunsSchema, "Its runs."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const [runs, untidied] = await Promise.all([
      tidyRuns(em, householdId),
      untidiedCount(em),
    ])
    return c.json({ runs, untidied }, 200)
  })
}

import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import {
  describeTidyRun,
  startTidyRun,
} from "../../../../services/recipes/review/tidy-run.ts"
import {
  asHouseholdAdmin,
  inHousehold,
  openToKeys,
} from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"
import { TidyRunInputSchema, TidyRunSchema } from "../../../schemas/tidy.ts"

const route = createRoute({
  method: "post",
  path: "/recipes/tidy",
  operationId: "startTidyRun",
  tags: ["Review"],
  summary: "Tidy up many recipes",
  description:
    "Tidies recipes in the background, one at a time, with the suggestions left in the Review queue: the ones picked, or every recipe not tidied yet (household admins only), say after moving from another app. It stops if there's no AI, this month's limit is reached, a key runs out of credit, or three recipes in a row fail. Follow it at `GET /recipes/tidy`.",
  ...openToKeys("recipes", "write"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: TidyRunInputSchema } },
    },
  },
  responses: {
    202: jsonResponse(TidyRunSchema, "Started, or the one already going."),
    400: errorResponse("Nothing to tidy."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { ids } = c.req.valid("json")
    // The whole library is a household admin's to start.
    const { em, householdId, userId } = ids
      ? inHousehold(c)
      : asHouseholdAdmin(c)
    const job = await startTidyRun(em, { householdId, userId, ids })
    return c.json(describeTidyRun(job), 202)
  })
}

import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../../core/context.ts"
import { cancelJob } from "../../../../../../../services/jobs/jobs.ts"
import {
  describeLinkImport,
  findLinkImport,
} from "../../../../../../../services/recipes/import/import-links.ts"
import { inHousehold, openToKeys } from "../../../../../../middleware/auth.ts"
import type { Router } from "../../../../../../router.ts"
import {
  LinkImportParam,
  LinkImportSchema,
} from "../../../../../../schemas/imports.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/recipes/import/links/{importId}/stop",
  operationId: "stopLinkImport",
  tags: ["Recipes"],
  summary: "Stop a link import",
  description:
    "The recipes it added stay. The link it's on finishes first, so the answer may still say it's running.",
  ...openToKeys("imports", "write"),
  request: { params: LinkImportParam },
  responses: {
    200: jsonResponse(LinkImportSchema, "Stopped, or stopping."),
    404: errorResponse("No such import in this household."),
    409: errorResponse("It has already finished."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { jobs }: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const job = await findLinkImport(
      em,
      c.req.valid("param").importId,
      householdId
    )
    await cancelJob(em, job, (id) => jobs.stopJob(id))
    return c.json(describeLinkImport(job), 200)
  })
}

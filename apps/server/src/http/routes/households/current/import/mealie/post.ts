import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { startAppImport } from "../../../../../../services/importers/job.ts"
import { checkMealie } from "../../../../../../services/importers/mealie/server.ts"
import { describeJob } from "../../../../../../services/jobs/jobs.ts"
import {
  asHouseholdAdmin,
  serverAdmin,
} from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import { MealieConnectionSchema } from "../../../../../schemas/imports.ts"
import { JobSchema } from "../../../../../schemas/jobs.ts"
import {
  errorResponse,
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/households/current/import/mealie",
  operationId: "importFromMealie",
  tags: ["Households"],
  summary: "Import from a Mealie",
  description:
    "The server admin only. Imports every recipe in the Mealie, in the background: follow the job at /households/current/jobs/{jobId}. Recipes an earlier import brought in are skipped. The token is sealed while the import runs, and forgotten once it's finished.",
  security: SESSION_SECURITY,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: MealieConnectionSchema } },
    },
  },
  responses: {
    202: jsonResponse(JobSchema, "Importing."),
    400: errorResponse("Mealie didn't take the token."),
    502: errorResponse("Couldn't reach Mealie, or it isn't Mealie."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { fetcher, settings }: AppDeps) => {
  router.openapi(route, async (c) => {
    serverAdmin(c)
    const { em, householdId, userId } = asHouseholdAdmin(c)
    const { url, token } = c.req.valid("json")
    // A wrong address or token says so now, not in the job.
    await checkMealie(fetcher, url, token)
    const job = await startAppImport(em, {
      householdId,
      userId,
      source: { from: "mealie", url, token: settings.seal(token) },
    })
    return c.json(describeJob(job), 202)
  })
}

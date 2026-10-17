import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { describeJob } from "../../../../../services/jobs/jobs.ts"
import { startImport } from "../../../../../services/transfer/import.ts"
import {
  checkUpload,
  saveUpload,
} from "../../../../../services/transfer/read-export.ts"
import { asHouseholdAdmin } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { JobSchema } from "../../../../schemas/jobs.ts"
import {
  errorResponse,
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/households/current/import",
  operationId: "importIntoHousehold",
  tags: ["Households"],
  summary: "Import a Merran export into the household",
  description:
    "Household admins only. The body is the export's zip. It's checked, then imported in the background: follow the job at /households/current/jobs/{jobId}. Recipes already here, like from importing the same export twice, are skipped.",
  security: SESSION_SECURITY,
  request: {
    body: {
      required: true,
      content: {
        "application/zip": { schema: z.string().openapi({ format: "binary" }) },
      },
    },
  },
  responses: {
    202: jsonResponse(JobSchema, "Importing."),
    400: errorResponse("That isn't a Merran export this Merran can read."),
    413: errorResponse("The file is too big."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { config }: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = asHouseholdAdmin(c)
    const { path: file } = await saveUpload(config.dataDir, c.req.raw.body)
    await checkUpload(file)
    const job = await startImport(em, {
      householdId,
      file,
      newHousehold: false,
      userId,
    })
    return c.json(describeJob(job), 202)
  })
}

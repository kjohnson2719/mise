import { stat } from "node:fs/promises"
import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../../../core/context.ts"
import { AppError } from "../../../../../../../../core/errors.ts"
import { startAppImport } from "../../../../../../../../services/importers/job.ts"
import { describeJob } from "../../../../../../../../services/jobs/jobs.ts"
import { uploadPath } from "../../../../../../../../services/transfer/read-export.ts"
import { asHouseholdAdmin } from "../../../../../../../middleware/auth.ts"
import type { Router } from "../../../../../../../router.ts"
import {
  ImportFileParam,
  StartImportFileSchema,
} from "../../../../../../../schemas/imports.ts"
import { JobSchema } from "../../../../../../../schemas/jobs.ts"
import {
  errorResponse,
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/households/current/import/files/{fileId}/start",
  operationId: "startFileImport",
  tags: ["Households"],
  summary: "Import a checked file from another app",
  description:
    "Household admins only. Imports a file checked at /households/current/import/files, in the background: follow the job at /households/current/jobs/{jobId}. Recipes an earlier import brought in are skipped.",
  security: SESSION_SECURITY,
  request: {
    params: ImportFileParam,
    body: {
      required: true,
      content: { "application/json": { schema: StartImportFileSchema } },
    },
  },
  responses: {
    202: jsonResponse(JobSchema, "Importing."),
    404: errorResponse("The file isn't here any more."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { config }: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = asHouseholdAdmin(c)
    const { fileId } = c.req.valid("param")
    // Only this household's own upload can be found this way.
    const file = uploadPath(config.dataDir, fileId, householdId)
    if (!(await stat(file).catch(() => null))) {
      throw new AppError(
        "not_found",
        "upload_gone",
        "That file isn't here any more. Choose it again."
      )
    }
    const job = await startAppImport(em, {
      householdId,
      userId,
      key: `import:${fileId}`,
      source: {
        from: "file",
        file,
        group: c.req.valid("json").group ?? null,
      },
    })
    return c.json(describeJob(job), 202)
  })
}

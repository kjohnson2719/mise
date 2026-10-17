import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { inspectUpload } from "../../../../../../services/importers/files.ts"
import { alreadyHere } from "../../../../../../services/importers/job.ts"
import { saveUpload } from "../../../../../../services/transfer/read-export.ts"
import { asHouseholdAdmin } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import { ImportFileSchema } from "../../../../../schemas/imports.ts"
import {
  errorResponse,
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"

const binary = { schema: z.string().openapi({ format: "binary" }) }

const route = createRoute({
  method: "post",
  path: "/households/current/import/files",
  operationId: "checkImportFile",
  tags: ["Households"],
  summary: "Check a file from another app",
  description:
    "Household admins only. The body is the file: a Mealie backup, or recipes exported from Mealie. It's kept, and what's in it is said, so its import can be started at /households/current/import/files/{fileId}/start. A file not started is cleared away after a week.",
  security: SESSION_SECURITY,
  request: {
    body: {
      required: true,
      content: {
        "application/zip": binary,
        "application/octet-stream": binary,
      },
    },
  },
  responses: {
    200: jsonResponse(ImportFileSchema, "What's in it."),
    400: errorResponse("Merran can't read that file."),
    413: errorResponse("The file is too big."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { config }: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = asHouseholdAdmin(c)
    const { id, path } = await saveUpload(config.dataDir, c.req.raw.body, {
      owner: householdId,
    })
    const { refs, ...summary } = await inspectUpload(path)
    return c.json(
      { id, ...summary, alreadyHere: await alreadyHere(em, refs) },
      200
    )
  })
}

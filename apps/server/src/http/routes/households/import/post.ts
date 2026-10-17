import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { Session } from "../../../../database/entities/index.ts"
import { createHousehold } from "../../../../services/households.ts"
import { describeJob } from "../../../../services/jobs/jobs.ts"
import { startImport } from "../../../../services/transfer/import.ts"
import {
  checkUpload,
  saveUpload,
} from "../../../../services/transfer/read-export.ts"
import { serverAdmin } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import {
  describeHousehold,
  HouseholdSchema,
} from "../../../schemas/households.ts"
import { HOUSEHOLD, JOB } from "../../../schemas/examples.ts"
import { JobSchema } from "../../../schemas/jobs.ts"
import {
  errorResponse,
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/households/import",
  operationId: "importHousehold",
  tags: ["Households"],
  summary: "Import a Merran export as a new household",
  description:
    "Server admins only, as for starting any household. The body is the export's zip. A household is made with the export's name and details, you become its owner, and it becomes the one in use on this device; its recipes are imported in the background: follow the job at /households/current/jobs/{jobId}.",
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
    202: jsonResponse(
      z
        .object({ household: HouseholdSchema, job: JobSchema })
        .openapi("HouseholdImport", {
          example: {
            household: HOUSEHOLD,
            job: {
              ...JOB,
              status: "queued",
              progress: null,
              attempts: 0,
              startedAt: null,
            },
          },
        }),
      "Made, and importing."
    ),
    400: errorResponse("That isn't a Merran export this Merran can read."),
    413: errorResponse("The file is too big."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { config }: AppDeps) => {
  router.openapi(route, async (c) => {
    const { user, session } = serverAdmin(c)
    const { path: file } = await saveUpload(config.dataDir, c.req.raw.body)
    const manifest = await checkUpload(file)
    const household = await createHousehold(c.var.em, {
      name: manifest.household.name,
      ownerId: user.id,
    })
    await c.var.em.nativeUpdate(
      Session,
      { id: session.id },
      { activeHousehold: household.id }
    )
    const job = await startImport(c.var.em, {
      householdId: household.id,
      file,
      newHousehold: true,
      userId: user.id,
    })
    return c.json(
      {
        household: describeHousehold(household, "owner"),
        job: describeJob(job),
      },
      202
    )
  })
}

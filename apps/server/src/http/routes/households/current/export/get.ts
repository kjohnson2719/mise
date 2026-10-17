import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { exportHousehold } from "../../../../../services/transfer/export.ts"
import { asHouseholdAdmin } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/households/current/export",
  operationId: "exportHousehold",
  tags: ["Households"],
  summary: "Export the household",
  description:
    "Household admins only. A zip of the household's details and recipes, with their photos, versions, cooking notes and pairings, in the Merran export format (docs/export-format.md). Recipes in Recently deleted, secrets, API keys and invites stay behind.",
  security: SESSION_SECURITY,
  responses: {
    200: {
      description: "The export, as a zip.",
      content: {
        "application/zip": { schema: z.string().openapi({ format: "binary" }) },
      },
    },
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = asHouseholdAdmin(c)
    const { filename, stream } = await exportHousehold(em, deps, householdId)
    return c.body(stream, 200, {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    })
  })
}

import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { activeLinkImports } from "../../../../../services/recipes/import/import-links.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { LinkImportListSchema } from "../../../../schemas/imports.ts"
import {
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/recipes/import/links",
  operationId: "listLinkImports",
  tags: ["Recipes"],
  summary: "The household's link imports still going",
  description: "Newest first. Finished ones aren't listed.",
  ...openToKeys("imports", "read"),
  responses: {
    200: jsonResponse(LinkImportListSchema, "The imports."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    return c.json({ imports: await activeLinkImports(em, householdId) }, 200)
  })
}

import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import {
  describeLinkImport,
  startLinkImport,
} from "../../../../../services/recipes/import/import-links.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  LinkImportRequestSchema,
  LinkImportSchema,
} from "../../../../schemas/imports.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/recipes/import/links",
  operationId: "importLinks",
  tags: ["Recipes"],
  summary: "Add recipes from several links",
  description:
    "Up to 100 links, imported one at a time in the background: follow along at /recipes/import/links/{importId}, which says how each link went. A link the library has already gives back that recipe rather than a new one.",
  ...openToKeys("imports", "write"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: LinkImportRequestSchema } },
    },
  },
  responses: {
    202: jsonResponse(LinkImportSchema, "Importing."),
    400: errorResponse("None of them is a link Merran can fetch."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    const { urls, tag } = c.req.valid("json")
    const job = await startLinkImport(em, { householdId, userId, urls, tag })
    return c.json(describeLinkImport(job), 202)
  })
}

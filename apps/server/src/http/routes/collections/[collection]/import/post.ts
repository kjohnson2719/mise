import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { AppError } from "../../../../../core/errors.ts"
import {
  describeLinkImport,
  startLinkImport,
} from "../../../../../services/recipes/import/import-links.ts"
import { getCollection } from "../../../../../services/sites/collections.ts"
import { languageOf } from "../../../../../services/sites/sites.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { LinkImportSchema } from "../../../../schemas/imports.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"
import { CollectionParam } from "../../../../schemas/sites.ts"

const route = createRoute({
  method: "post",
  path: "/collections/{collection}/import",
  operationId: "importCollection",
  tags: ["Collections"],
  summary: "Import a whole collection",
  description:
    "Its recipes not in the library yet, in the background, as several links are: follow along at /recipes/import/links/{importId}.",
  ...openToKeys("imports", "write"),
  request: { params: CollectionParam },
  responses: {
    202: jsonResponse(LinkImportSchema, "Importing."),
    404: errorResponse("No such collection."),
    409: errorResponse("Every recipe in it is in the library already."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    const collection = await getCollection(
      em,
      householdId,
      await languageOf(em, userId),
      c.req.valid("param").collection
    )
    const urls = collection.recipes
      .filter((recipe) => !recipe.inLibrary)
      .map((recipe) => recipe.url)
    if (urls.length === 0) {
      throw new AppError(
        "conflict",
        "collection_imported",
        "Every recipe in it is in your library already."
      )
    }
    const job = await startLinkImport(em, { householdId, userId, urls })
    return c.json(describeLinkImport(job), 202)
  })
}

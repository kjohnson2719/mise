import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { bulkDeleted } from "../../../../../services/recipes/deleted.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  BulkResultSchema,
  DeletedBulkInputSchema,
} from "../../../../schemas/recipes.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/recipes/deleted/bulk",
  operationId: "bulkChangeDeletedRecipes",
  tags: ["Recipes"],
  summary: "Put back, or delete for good, several recipes at once",
  description:
    "For recipes in Recently deleted, up to 500 at a time. Ones that aren't there are skipped.",
  ...openToKeys("recipes", "write"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: DeletedBulkInputSchema } },
    },
  },
  responses: {
    200: jsonResponse(BulkResultSchema, "Done."),
    400: errorResponse("Nothing picked, or something else is off."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { files }: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    return c.json(await bulkDeleted(em, files, c.req.valid("json")), 200)
  })
}

import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import {
  KEEP_DELETED_DAYS,
  listDeleted,
} from "../../../../services/recipes/deleted.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { DeletedRecipeSchema } from "../../../schemas/recipes.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/recipes/deleted",
  operationId: "listDeletedRecipes",
  tags: ["Recipes"],
  summary: "Recently deleted",
  description: `Deleted recipes, which can be put back for ${KEEP_DELETED_DAYS} days, latest first.`,
  ...openToKeys("recipes", "read"),
  responses: {
    200: jsonResponse(z.array(DeletedRecipeSchema), "What's there."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    return c.json(await listDeleted(em), 200)
  })
}

import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { emptyDeleted } from "../../../../services/recipes/deleted.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { SIGNED_IN_ERRORS } from "../../../schemas/responses.ts"

const route = createRoute({
  method: "delete",
  path: "/recipes/deleted",
  operationId: "emptyDeletedRecipes",
  tags: ["Recipes"],
  summary: "Empty Recently deleted",
  description: "Deletes everything in it for good. This can't be undone.",
  ...openToKeys("recipes", "write"),
  responses: {
    204: { description: "Emptied." },
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { files }: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    await emptyDeleted(em, files)
    return c.body(null, 204)
  })
}

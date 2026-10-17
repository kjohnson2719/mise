import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { deleteTag } from "../../../../../services/recipes/tags.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { TagParam } from "../../../../schemas/recipes.ts"
import {
  errorResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "delete",
  path: "/recipes/tags/{tagId}",
  operationId: "deleteTag",
  tags: ["Recipes"],
  summary: "Delete a tag",
  description: "Takes it off every recipe. The recipes stay.",
  ...openToKeys("recipes", "write"),
  request: { params: TagParam },
  responses: {
    204: { description: "Deleted." },
    404: errorResponse("No such tag."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    await deleteTag(em, c.req.valid("param").tagId)
    return c.body(null, 204)
  })
}

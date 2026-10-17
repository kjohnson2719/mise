import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { listTags } from "../../../../services/recipes/tags.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { TagSchema } from "../../../schemas/recipes.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/recipes/tags",
  operationId: "listTags",
  tags: ["Recipes"],
  summary: "Recipe tags",
  description:
    "The household's tags, with how many recipes have each, alphabetically.",
  ...openToKeys("recipes", "read"),
  responses: {
    200: jsonResponse(z.array(TagSchema), "The tags."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    return c.json(await listTags(em), 200)
  })
}

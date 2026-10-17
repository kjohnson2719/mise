import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { listCookNotes } from "../../../../../services/recipes/cook-notes.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { CookNoteSchema, RecipeParam } from "../../../../schemas/recipes.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/recipes/{recipe}/cook-notes",
  operationId: "listCookNotes",
  tags: ["Recipes"],
  summary: "How cooking a recipe went",
  description:
    "Each time it was cooked and someone said how it went: stars, a note, or both. Newest first, the latest 50.",
  ...openToKeys("recipes", "read"),
  request: { params: RecipeParam },
  responses: {
    200: jsonResponse(z.array(CookNoteSchema), "The notes."),
    404: errorResponse("No such recipe."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    return c.json(await listCookNotes(em, c.req.valid("param").recipe), 200)
  })
}

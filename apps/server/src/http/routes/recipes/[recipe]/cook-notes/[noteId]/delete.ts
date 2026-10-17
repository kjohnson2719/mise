import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { deleteCookNote } from "../../../../../../services/recipes/cook-notes.ts"
import { inHousehold, openToKeys } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import { CookNoteParam } from "../../../../../schemas/recipes.ts"
import {
  errorResponse,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"

const route = createRoute({
  method: "delete",
  path: "/recipes/{recipe}/cook-notes/{noteId}",
  operationId: "deleteCookNote",
  tags: ["Recipes"],
  summary: "Delete a cooking note",
  description: "The recipe keeps its rating.",
  ...openToKeys("recipes", "write"),
  request: { params: CookNoteParam },
  responses: {
    204: { description: "Deleted." },
    404: errorResponse("No such recipe or note."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    const { recipe, noteId } = c.req.valid("param")
    await deleteCookNote(em, { recipe, noteId })
    return c.body(null, 204)
  })
}

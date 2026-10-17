import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { addCookNote } from "../../../../../services/recipes/cook-notes.ts"
import { suggestFromNote } from "../../../../../services/recipes/review/note-edits.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  AddedCookNoteSchema,
  CookNoteInputSchema,
  RecipeParam,
} from "../../../../schemas/recipes.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/recipes/{recipe}/cook-notes",
  operationId: "createCookNote",
  tags: ["Recipes"],
  summary: "Say how cooking a recipe went",
  description:
    'Stars, a note for next time, or both. The stars become the recipe\'s rating, without keeping a version. With AI for cooking notes, a note is turned into a suggested change to the recipe in the background, waiting in the Review queue; `suggesting` says so. An opinion ("the kids loved it") is just kept.',
  ...openToKeys("recipes", "write"),
  request: {
    params: RecipeParam,
    body: {
      required: true,
      content: { "application/json": { schema: CookNoteInputSchema } },
    },
  },
  responses: {
    201: jsonResponse(AddedCookNoteSchema, "Saved."),
    400: errorResponse("Neither stars nor a note, or something else is off."),
    404: errorResponse("No such recipe."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    const note = await addCookNote(em, {
      householdId,
      userId,
      recipe: c.req.valid("param").recipe,
      input: c.req.valid("json"),
    })
    const suggesting = await suggestFromNote(deps, em, {
      householdId,
      userId,
      noteId: note.id,
      note: note.note,
    })
    return c.json({ ...note, suggesting }, 201)
  })
}

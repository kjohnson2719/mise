import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { photoLibrary } from "../../../../services/ai-photos/runs.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { PhotoLibrarySchema } from "../../../schemas/photos.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/recipes/photos",
  operationId: "getPhotoLibrary",
  tags: ["Recipes"],
  summary: "AI photos across the library",
  description:
    "How many recipes have no photo, whether AI photos can be made for the household and why not, its photo style, and the latest run making them.",
  ...openToKeys("recipes", "read"),
  responses: {
    200: jsonResponse(PhotoLibrarySchema, "The library."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    return c.json(await photoLibrary(deps, em, householdId), 200)
  })
}

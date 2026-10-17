import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import {
  describePhotoRun,
  startPhotoRun,
} from "../../../../services/ai-photos/runs.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { PhotoRunSchema } from "../../../schemas/photos.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/recipes/photos",
  operationId: "startPhotoRun",
  tags: ["Recipes"],
  summary: "Make AI photos for the library",
  description:
    "A photo for every recipe without one, in the household's style, in the background, on its OpenAI or Google key. One at a time: starting another gives back the one going.",
  ...openToKeys("recipes", "write"),
  responses: {
    202: jsonResponse(PhotoRunSchema, "Started."),
    400: errorResponse("Every recipe has a photo."),
    422: errorResponse(
      "AI photos are off on the server, or the household has no key for them."
    ),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    const job = await startPhotoRun(deps, em, { householdId, userId })
    return c.json(describePhotoRun(job), 202)
  })
}

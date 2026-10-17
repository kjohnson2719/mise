import { createRoute, z } from "@hono/zod-openapi"
import { bodyLimit } from "hono/body-limit"
import type { AppDeps } from "../../../../../core/context.ts"
import { AppError } from "../../../../../core/errors.ts"
import { MAX_PHOTOS } from "../../../../../services/recipes/import/ai-reader.ts"
import { importPhotos } from "../../../../../services/recipes/import/import-with-ai.ts"
import { MAX_PHOTO_BYTES } from "../../../../../services/recipes/photos.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { RecipeSchema } from "../../../../schemas/recipes.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const keys = openToKeys("recipes", "write")

const PhotoImportSchema = z.object({
  // Checked by the import, which says what's wrong in words.
  photos: z
    .any()
    .optional()
    .openapi({
      type: "array",
      items: { type: "string", format: "binary" },
      description: "The photos, in order: one `photos` field for each.",
    }),
})

const route = createRoute({
  method: "post",
  path: "/recipes/import/photos",
  operationId: "importRecipePhotos",
  tags: ["Recipes"],
  summary: "Add a recipe from photos or a PDF",
  description: `Photos of one recipe, up to ${MAX_PHOTOS}, in order: a cookbook page or two, a card, a screenshot; or a PDF of it. Read by AI and added as a recipe. JPEG, PNG or WebP up to 15 MB each, or a PDF up to 10 MB. Uses the household's model for importing, which must be able to read photos or PDFs, and counts towards its AI spend.`,
  ...keys,
  middleware: [
    ...keys.middleware,
    bodyLimit({
      maxSize: MAX_PHOTOS * MAX_PHOTO_BYTES,
      onError: () => {
        throw new AppError(
          "too_large",
          "photos_too_large",
          "Those photos are too big. Use ones under 15 MB each."
        )
      },
    }),
  ] as const,
  request: {
    body: {
      required: true,
      content: { "multipart/form-data": { schema: PhotoImportSchema } },
    },
  },
  responses: {
    201: jsonResponse(RecipeSchema, "Added."),
    400: errorResponse("No photos, too many, or not photos Merran can read."),
    413: errorResponse("The photos are too big."),
    422: errorResponse(
      "No recipe found in them, or the model can't read photos or PDFs."
    ),
    429: errorResponse("This month's AI limit is reached, or the AI is busy."),
    502: errorResponse("The AI provider failed."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    const body = await c.req.parseBody({ all: true })
    const photos = await Promise.all(
      [body.photos ?? []]
        .flat()
        .filter((value): value is File => value instanceof File)
        .map(async (file) => Buffer.from(await file.arrayBuffer()))
    )
    const recipe = await importPhotos(em, deps, {
      householdId,
      userId,
      photos,
    })
    return c.json(recipe, 201)
  })
}

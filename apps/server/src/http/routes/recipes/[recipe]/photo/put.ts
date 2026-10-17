import { createRoute, z } from "@hono/zod-openapi"
import { bodyLimit } from "hono/body-limit"
import { AppError } from "../../../../../core/errors.ts"
import type { AppDeps } from "../../../../../core/context.ts"
import { MAX_PHOTO_BYTES } from "../../../../../services/recipes/photos.ts"
import { setPhoto } from "../../../../../services/recipes/recipes.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { RecipeParam, RecipeSchema } from "../../../../schemas/recipes.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const keys = openToKeys("recipes", "write")

const route = createRoute({
  method: "put",
  path: "/recipes/{recipe}/photo",
  operationId: "setRecipePhoto",
  tags: ["Recipes"],
  summary: "Give a recipe a photo",
  description:
    "Send the photo itself as the body, as a JPEG, PNG, WebP or GIF of up to 15 MB. It replaces any photo the recipe had.",
  ...keys,
  middleware: [
    ...keys.middleware,
    bodyLimit({
      maxSize: MAX_PHOTO_BYTES,
      onError: () => {
        throw new AppError(
          "too_large",
          "photo_too_large",
          "That photo is too big. Use one under 15 MB."
        )
      },
    }),
  ] as const,
  request: {
    params: RecipeParam,
    body: {
      required: true,
      content: {
        "image/*": { schema: z.string().openapi({ format: "binary" }) },
      },
    },
  },
  responses: {
    200: jsonResponse(RecipeSchema, "The recipe, with its new photo."),
    400: errorResponse("That isn't a photo Merran can read."),
    404: errorResponse("No such recipe."),
    413: errorResponse("The photo is over 15 MB."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { files }: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const photo = Buffer.from(await c.req.arrayBuffer())
    if (photo.length === 0) {
      throw new AppError("invalid", "no_photo", "Send the photo as the body.")
    }
    const recipe = await setPhoto(em, files, {
      householdId,
      recipe: c.req.valid("param").recipe,
      photo,
    })
    return c.json(recipe, 200)
  })
}

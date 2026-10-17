import { createRoute, z } from "@hono/zod-openapi"
import { AppError } from "../../../../../core/errors.ts"
import type { AppDeps } from "../../../../../core/context.ts"
import { readPhoto } from "../../../../../services/recipes/photos.ts"
import { findRecipe } from "../../../../../services/recipes/recipes.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { RecipeParam } from "../../../../schemas/recipes.ts"
import {
  errorResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/recipes/{recipe}/photo",
  operationId: "getRecipePhoto",
  tags: ["Recipes"],
  summary: "A recipe's photo",
  description:
    "As WebP: `full` for the recipe page, or `card`, cropped for recipe cards. Use the links in the recipe's `photo`, which can be kept for good.",
  ...openToKeys("recipes", "read"),
  request: {
    params: RecipeParam,
    query: z.object({
      size: z.enum(["full", "card"]).default("full"),
      v: z.string().optional().openapi({
        description: "Which photo: the links in `photo` say.",
      }),
    }),
  },
  responses: {
    200: {
      description: "The photo.",
      content: {
        "image/webp": { schema: z.string().openapi({ format: "binary" }) },
      },
    },
    404: errorResponse("No such recipe, or it has no photo."),
    ...SIGNED_IN_ERRORS,
  },
})

const noPhoto = () =>
  new AppError("not_found", "no_photo", "That recipe has no photo.")

export default (router: Router, { files }: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const { size, v } = c.req.valid("query")
    const recipe = await findRecipe(em, c.req.valid("param").recipe)
    if (!recipe.image) throw noPhoto()
    const photo = await readPhoto(files, householdId, recipe.image, size)
    if (!photo) throw noPhoto()
    c.header("Content-Type", "image/webp")
    // A link naming this photo always shows it, so it can be kept for good.
    c.header(
      "Cache-Control",
      v === recipe.image
        ? "private, max-age=31536000, immutable"
        : "private, no-cache"
    )
    return c.body(new Uint8Array(photo), 200)
  })
}

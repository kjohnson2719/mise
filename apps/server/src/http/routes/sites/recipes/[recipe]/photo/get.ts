import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { AppError } from "../../../../../../core/errors.ts"
import { findShelfRecipe } from "../../../../../../services/sites/sites.ts"
import { shelfPhoto } from "../../../../../../services/sites/shelf.ts"
import { inHousehold, openToKeys } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import {
  errorResponse,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"
import { ShelfRecipeParam } from "../../../../../schemas/sites.ts"

const route = createRoute({
  method: "get",
  path: "/sites/recipes/{recipe}/photo",
  operationId: "getSiteRecipePhoto",
  tags: ["Sites"],
  summary: "A site recipe's photo",
  description:
    "A small copy, as WebP, fetched once through Merran so browsing doesn't load photos from other sites.",
  ...openToKeys("recipes", "read"),
  request: { params: ShelfRecipeParam },
  responses: {
    200: {
      description: "The photo.",
      content: {
        "image/webp": { schema: z.string().openapi({ format: "binary" }) },
      },
    },
    404: errorResponse("No such recipe, or no photo that loads."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    const row = await findShelfRecipe(em, c.req.valid("param").recipe)
    const photo = await shelfPhoto(deps, em, row)
    if (!photo) {
      throw new AppError("not_found", "no_photo", "That recipe has no photo.")
    }
    c.header("Content-Type", "image/webp")
    c.header("Cache-Control", "private, max-age=604800")
    return c.body(new Uint8Array(photo), 200)
  })
}

import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { followedRecipes } from "../../../../services/sites/sites.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../../schemas/responses.ts"
import { SiteRecipesSchema } from "../../../schemas/sites.ts"

const route = createRoute({
  method: "get",
  path: "/sites/recipes",
  operationId: "listSiteRecipes",
  tags: ["Sites"],
  summary: "The newest recipes from followed sites",
  description:
    "Up to 24, newest first, from every site the household follows: for Recipes' spotlight and Today's idea for tonight.",
  ...openToKeys("recipes", "read"),
  responses: {
    200: jsonResponse(SiteRecipesSchema, "Their newest recipes."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    return c.json({ recipes: await followedRecipes(em, householdId) }, 200)
  })
}

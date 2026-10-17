import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { listAliases } from "../../../../services/list/food-aliases.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { FoodAliasesSchema } from "../../../schemas/list.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/list/foods",
  operationId: "listFoodAliases",
  tags: ["List"],
  summary: "The household's own names for foods",
  description:
    "What it said was the same food as another (Same as…) or kept apart (Not the same) on the list, which win over Merran's own names for it.",
  ...openToKeys("list", "read"),
  responses: {
    200: jsonResponse(FoodAliasesSchema, "Its names, by name."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    return c.json({ aliases: await listAliases(em) }, 200)
  })
}

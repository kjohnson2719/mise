import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { removePairing } from "../../../../../../services/recipes/pairings.ts"
import { inHousehold, openToKeys } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import {
  PairingParam,
  RecipePairingsSchema,
} from "../../../../../schemas/recipes.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"

const route = createRoute({
  method: "delete",
  path: "/recipes/{recipe}/pairings/{pairingId}",
  operationId: "removePairing",
  tags: ["Recipes"],
  summary: "Take something off what a recipe goes with",
  description: "The recipes stay.",
  ...openToKeys("recipes", "write"),
  request: { params: PairingParam },
  responses: {
    200: jsonResponse(RecipePairingsSchema, "What it goes with now."),
    404: errorResponse("No such recipe or pairing."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    const { recipe, pairingId } = c.req.valid("param")
    return c.json(await removePairing(em, { recipe, pairingId }), 200)
  })
}

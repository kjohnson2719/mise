import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { sameAs } from "../../../../../../services/list/teach.ts"
import { inHousehold, openToKeys } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import {
  ItemParam,
  SameAsResultSchema,
  SameAsSchema,
} from "../../../../../schemas/list.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/list/items/{itemId}/same-as",
  operationId: "sameAsListItem",
  tags: ["List"],
  summary: "Say something on the list is the same food as another",
  description:
    "The household's own name for the food (docs/foods.md): from now on it's the other's food, on the list, at home and in what's to come, and the two lines join where their amounts add up.",
  ...openToKeys("list", "write"),
  request: {
    params: ItemParam,
    body: {
      required: true,
      content: { "application/json": { schema: SameAsSchema } },
    },
  },
  responses: {
    200: jsonResponse(SameAsResultSchema, "Remembered, and joined."),
    400: errorResponse("The same thing twice."),
    404: errorResponse("Not on the list."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const { itemId } = c.req.valid("param")
    const { item } = c.req.valid("json")
    return c.json(await sameAs(em, householdId, itemId, item), 200)
  })
}

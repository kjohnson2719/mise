import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { forgetAlias } from "../../../../../services/list/teach.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { AliasParam } from "../../../../schemas/list.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "delete",
  path: "/list/foods/{aliasId}",
  operationId: "forgetFoodAlias",
  tags: ["List"],
  summary: "Forget one of the household's names for a food",
  description:
    "Merran's own name for it counts again. Lines already joined stay as they are.",
  ...openToKeys("list", "write"),
  request: { params: AliasParam },
  responses: {
    200: jsonResponse(
      z.object({ ok: z.literal(true) }).openapi({ example: { ok: true } }),
      "Forgotten."
    ),
    404: errorResponse("No such name."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    const { aliasId } = c.req.valid("param")
    await forgetAlias(em, aliasId)
    return c.json({ ok: true as const }, 200)
  })
}

import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { checkLinks } from "../../../../../../services/recipes/import/import-links.ts"
import { inHousehold, openToKeys } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import {
  LinkCheckRequestSchema,
  LinkCheckSchema,
} from "../../../../../schemas/imports.ts"
import {
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/recipes/import/links/check",
  operationId: "checkLinks",
  tags: ["Recipes"],
  summary: "Find the links in some text",
  description:
    "The links in pasted text, up to 100, tidied, with which are in the library already and which are videos (which can't be imported yet). Nothing is imported.",
  ...openToKeys("recipes", "read"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: LinkCheckRequestSchema } },
    },
  },
  responses: {
    200: jsonResponse(LinkCheckSchema, "The links."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    return c.json(await checkLinks(em, c.req.valid("json").text), 200)
  })
}

import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { AppError } from "../../../../../../core/errors.ts"
import { NUTRITION } from "../../../../../../modules/nutrition/settings.ts"
import { createFdcClient } from "../../../../../../services/nutrition/fdc.ts"
import { serverAdmin } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import {
  UsdaKeyTestedSchema,
  UsdaKeyTestSchema,
} from "../../../../../schemas/nutrition.ts"
import {
  errorResponse,
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/settings/server/nutrition/test",
  operationId: "testUsdaKey",
  tags: ["Settings"],
  summary: "Test a USDA key",
  description:
    "Server admins only. Searches USDA FoodData Central for apples with a key, before saving it, or with the saved one.",
  security: SESSION_SECURITY,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: UsdaKeyTestSchema } },
    },
  },
  responses: {
    200: jsonResponse(UsdaKeyTestedSchema, "It works."),
    400: errorResponse("No key to test."),
    422: errorResponse("USDA refused the key."),
    429: errorResponse("USDA's limit for the hour."),
    502: errorResponse("USDA didn't answer."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { settings, fetcher }: AppDeps) => {
  router.openapi(route, async (c) => {
    serverAdmin(c)
    const key =
      c.req.valid("json").usdaKey ?? (await settings.server(NUTRITION.usdaKey))
    if (!key) {
      throw new AppError("invalid", "no_key", "Add a USDA key to test it.")
    }
    const found = await createFdcClient(fetcher, key).search("apple")
    return c.json(
      { found: found[0]?.description ?? "Nothing for apples." },
      200
    )
  })
}

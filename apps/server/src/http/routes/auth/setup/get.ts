import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { User } from "../../../../database/entities/index.ts"
import type { Router } from "../../../router.ts"
import { jsonResponse } from "../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/auth/setup",
  operationId: "getSetupStatus",
  tags: ["Sign-in"],
  summary: "Whether the server still needs setting up",
  responses: {
    200: jsonResponse(
      z
        .object({ needed: z.boolean() })
        .openapi("SetupStatus", { example: { needed: true } }),
      "True until the first account exists."
    ),
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const accounts = await c.var.em.count(User)
    return c.json({ needed: accounts === 0 }, 200)
  })
}

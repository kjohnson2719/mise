import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { needKrogerApp } from "../../../../../services/stores/connections.ts"
import { locationsNear } from "../../../../../services/stores/kroger.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"
import { LocationsSchema, ZipQuery } from "../../../../schemas/stores.ts"

const route = createRoute({
  method: "get",
  path: "/stores/kroger/locations",
  operationId: "listKrogerLocations",
  tags: ["Stores"],
  summary: "Kroger stores near a ZIP code",
  description:
    "Up to twelve of Kroger's stores, of any banner, near a ZIP code.",
  ...openToKeys("list", "read"),
  request: { query: ZipQuery },
  responses: {
    200: jsonResponse(LocationsSchema, "Stores near it."),
    422: errorResponse("Kroger isn't set up on this server."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    inHousehold(c)
    const app = await needKrogerApp(deps)
    const locations = await locationsNear(
      deps.fetcher,
      app,
      c.req.valid("query").zip
    )
    return c.json({ locations }, 200)
  })
}

import { OpenAPIHono } from "@hono/zod-openapi"
import type { AppDeps, AppEnv } from "../core/context.ts"
import { errorBody, fieldErrors } from "./errors.ts"

/** The API's router, which every route registers itself on. */
export type Router = OpenAPIHono<AppEnv>

/**
 * What every route file and every routes index.ts exports: a function that
 * adds its routes to the router, with what the app is built from.
 */
export type RegisterRoutes = (router: Router, deps: AppDeps) => void

/**
 * A router for a group of routes. Use it for every group, so invalid input
 * always gets the standard error with a message per field.
 */
export function createRouter() {
  return new OpenAPIHono<AppEnv>({
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json(
          errorBody(
            "invalid_request",
            "Some of what was sent isn't right.",
            fieldErrors(result.error)
          ),
          400
        )
      }
    },
  })
}

import type { RouteConfig } from "@hono/zod-openapi"
import type { AppDeps } from "../core/context.ts"
import { createRouter } from "../http/router.ts"
import registerAllRoutes from "../http/routes/index.ts"

type Schema = {
  $ref?: string
  type?: string | string[]
  items?: Schema
  example?: unknown
  examples?: unknown[]
}

/** A body or an answer as the reference describes it. */
export type Media = { schema?: Schema; example?: unknown }

export type Operation = {
  operationId?: string
  summary?: string
  parameters?: {
    name: string
    in: string
    required?: boolean
    example?: unknown
    schema?: Schema
  }[]
  requestBody?: { content?: Record<string, Media> }
  responses?: Record<string, { content?: Record<string, Media> }>
}

/**
 * The example the reference shows for a body or an answer: its own, or its
 * schema's. A list's example is its item's, once.
 */
export function exampleIn(
  media: Media | undefined,
  schemas: Record<string, unknown>
): unknown {
  if (media?.example !== undefined) return media.example
  const of = (schema: Schema | undefined): unknown => {
    const found = schema?.$ref
      ? (schemas[schema.$ref.split("/").pop()!] as Schema | undefined)
      : schema
    if (!found) return undefined
    if (found.example !== undefined) return found.example
    if (found.examples?.length) return found.examples[0]
    if (found.type === "array") {
      const item = of(found.items)
      return item === undefined ? undefined : [item]
    }
    return undefined
  }
  return of(media?.schema)
}

/**
 * Merran's routes, each with what the API reference says about it, built
 * from the route definitions alone: no database, nothing running.
 */
export function describedRoutes() {
  const router = createRouter()
  registerAllRoutes(router, {} as AppDeps)
  const document = router.getOpenAPI31Document({
    openapi: "3.1.0",
    info: { title: "Merran API", version: "test" },
  })
  const schemas = (document.components?.schemas ?? {}) as Record<
    string,
    unknown
  >
  return router.openAPIRegistry.definitions.flatMap((definition) => {
    if (definition.type !== "route") return []
    const route = definition.route as RouteConfig & Record<string, unknown>
    const operation = (
      document.paths?.[route.path] as Record<string, Operation> | undefined
    )?.[route.method]
    if (!operation) throw new Error(`${route.path} isn't in the reference`)
    return [
      {
        name: `${route.method.toUpperCase()} ${route.path}`,
        route,
        operation,
        example: (media: Media | undefined) => exampleIn(media, schemas),
      },
    ]
  })
}

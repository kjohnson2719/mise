import type { z } from "@hono/zod-openapi"
import { ErrorSchema } from "../errors.ts"

/** OpenAPI security requirements: any one of them will do. */
type Security = Record<string, string[]>[]

/** A JSON response, for a route's `responses`. */
export function jsonResponse<T extends z.ZodType>(
  schema: T,
  description: string
) {
  return { description, content: { "application/json": { schema } } }
}

/** An error response in the standard shape. */
export function errorResponse(description: string) {
  return jsonResponse(ErrorSchema, description)
}

/** What any route needing a sign-in can answer with. */
export const SIGNED_IN_ERRORS = {
  401: errorResponse("Not signed in."),
  403: errorResponse("Not allowed."),
}

/** The session cookie, for a route's `security`. */
export const SESSION_SECURITY: Security = [{ session: [] }]

/** An API key, for a route's `security`. */
export const API_KEY_SECURITY: Security = [{ apiKey: [] }]

/** Either a session or an API key with the right permission. */
export const SESSION_OR_API_KEY_SECURITY: Security = [
  { session: [] },
  { apiKey: [] },
]

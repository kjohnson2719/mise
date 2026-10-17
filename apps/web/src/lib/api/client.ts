import createClient from "openapi-fetch"
import type { components, paths } from "./schema"

/**
 * The API, typed from its OpenAPI spec (schema.d.ts, made by `pnpm api`).
 * The web app uses the same API as everyone else.
 */
export const api = createClient<paths>({ baseUrl: "/" })

/**
 * This tab, as the server knows it: sent with every change, so live
 * updates tell the person's other devices and tabs, not this one.
 */
export const CLIENT_ID = crypto.randomUUID()

api.use({
  onRequest({ request }) {
    request.headers.set("X-Merran-Client", CLIENT_ID)
    return request
  },
})

export type Schemas = components["schemas"]

/** An error from the API, with its stable code and a message to show. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fields: Record<string, string>

  constructor(
    status: number,
    code: string,
    message: string,
    fields: Record<string, string> = {}
  ) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
    this.fields = fields
  }
}

type ErrorShape = {
  // Merran's own routes
  error?: { code?: string; message?: string; fields?: Record<string, string> }
  // Better Auth's endpoints
  code?: string
  message?: string
}

/**
 * The data from an API call, or an ApiError. Works with both error shapes:
 * Merran's `{ error: { code, message, fields } }` and Better Auth's
 * `{ code, message }`.
 */
export async function unwrap<T>(
  call: Promise<{ data?: T; error?: unknown; response: Response }>
): Promise<T> {
  const { data, error, response } = await call
  if (response.ok) return data as T

  const body = (error ?? {}) as ErrorShape
  throw new ApiError(
    response.status,
    body.error?.code ?? body.code ?? "error",
    body.error?.message ?? body.message ?? response.statusText,
    body.error?.fields
  )
}

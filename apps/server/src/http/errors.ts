import { z } from "@hono/zod-openapi"
import type { ErrorHandler, NotFoundHandler } from "hono"
import { HTTPException } from "hono/http-exception"
import type { ContentfulStatusCode } from "hono/utils/http-status"
import type { ZodError } from "zod"
import type { AppEnv } from "../core/context.ts"
import { AppError, type AppErrorKind } from "../core/errors.ts"
import { reportError } from "../modules/error-tracking/reporter.ts"

/** The one shape every error response has. */
export const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string().openapi({ example: "not_found" }),
      message: z.string().openapi({ example: "There's nothing here." }),
      fields: z
        .record(z.string(), z.string())
        .optional()
        .openapi({ example: { name: "Give it a name." } }),
    }),
  })
  .openapi("Error")

export type ErrorBody = z.infer<typeof ErrorSchema>

export function errorBody(
  code: string,
  message: string,
  fields?: Record<string, string>
): ErrorBody {
  return { error: { code, message, ...(fields ? { fields } : {}) } }
}

/** The status each kind of AppError is answered with. */
const STATUSES: Record<AppErrorKind, ContentfulStatusCode> = {
  invalid: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  gone: 410,
  too_large: 413,
  unprocessable: 422,
  rate_limited: 429,
  internal: 500,
  upstream: 502,
}

/** The first problem for each field, keyed by its path ("steps.2.text"). */
export function fieldErrors(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "request"
    fields[key] ??= issue.message
  }
  return fields
}

const CODES: Partial<Record<number, string>> = {
  400: "bad_request",
  401: "unauthorized",
  403: "forbidden",
  404: "not_found",
  405: "method_not_allowed",
  409: "conflict",
  413: "too_large",
  429: "rate_limited",
}

export const handleError: ErrorHandler<AppEnv> = (err, c) => {
  if (err instanceof AppError) {
    return c.json(
      errorBody(err.code, err.message, err.fields),
      STATUSES[err.kind]
    )
  }
  if (err instanceof HTTPException) {
    return c.json(
      errorBody(
        CODES[err.status] ?? "error",
        err.message || "That didn't work."
      ),
      err.status
    )
  }
  c.var.logger.error({ err }, "Unhandled error")
  reportError(err, { requestId: c.var.requestId })
  return c.json(
    errorBody("internal", "Something went wrong on the server."),
    500
  )
}

export const handleNotFound: NotFoundHandler<AppEnv> = (c) =>
  c.json(errorBody("not_found", "There's nothing here."), 404)

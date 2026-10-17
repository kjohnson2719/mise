/** What went wrong, in terms any caller can act on: HTTP, MCP or a job. */
export type AppErrorKind =
  | "invalid"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "gone"
  /** Too big to take, like a photo over the size limit. */
  | "too_large"
  /** Understood, but nothing can be done with it, like a page with no recipe on it. */
  | "unprocessable"
  | "rate_limited"
  | "internal"
  /** Another site or service Merran relies on failed, or took too long. */
  | "upstream"

/**
 * Throw this from a service, a route or middleware. The message is shown to
 * people, so it must be safe and plain. The code is stable, for programs to
 * check. Each caller turns the kind into its own answer, like a status code.
 */
export class AppError extends Error {
  readonly kind: AppErrorKind
  readonly code: string
  readonly fields: Record<string, string> | undefined

  constructor(
    kind: AppErrorKind,
    code: string,
    message: string,
    fields?: Record<string, string>
  ) {
    super(message)
    this.name = "AppError"
    this.kind = kind
    this.code = code
    this.fields = fields
  }
}

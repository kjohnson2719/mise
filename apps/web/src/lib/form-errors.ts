import type { FieldValues, Path, UseFormSetError } from "react-hook-form"

import { ApiError } from "./api/client"

/**
 * Shows an API error on a form: each field's problem under that field, and
 * anything else as the form's own error. Returns false for errors that
 * aren't from the API, so the caller can rethrow them.
 */
export function showFormError<T extends FieldValues>(
  setError: UseFormSetError<T>,
  error: unknown,
  /** API field names that live under another name in the form. */
  rename: Record<string, Path<T>> = {}
): boolean {
  if (!(error instanceof ApiError)) return false
  const fields = Object.entries(error.fields)
  for (const [field, message] of fields) {
    setError(rename[field] ?? (field as Path<T>), { message })
  }
  if (fields.length === 0) setError("root", { message: error.message })
  return true
}

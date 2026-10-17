import * as React from "react"

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"

/** A labelled box for longer text, with a hint or its error underneath. */
export function TextareaField({
  label,
  hideLabel = false,
  description,
  error,
  id,
  ...props
}: React.ComponentProps<typeof Textarea> & {
  label: string
  /** For when a heading already says what it is: read out, not shown. */
  hideLabel?: boolean
  description?: React.ReactNode
  error?: string
}) {
  const fallbackId = React.useId()
  const textareaId = id ?? fallbackId
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel
        htmlFor={textareaId}
        className={hideLabel ? "sr-only" : undefined}
      >
        {label}
      </FieldLabel>
      <Textarea
        id={textareaId}
        aria-invalid={error ? true : undefined}
        {...props}
      />
      {error ? (
        <FieldError>{error}</FieldError>
      ) : (
        description && <FieldDescription>{description}</FieldDescription>
      )}
    </Field>
  )
}

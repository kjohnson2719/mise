import type { ErrorEvent } from "@sentry/browser"

// What never leaves the browser in an error report. The server scrubs its
// own reports the same way (apps/server/src/modules/error-tracking/scrub.ts).

const KEYS = [
  /\bmrn_[A-Za-z0-9_-]{8,}/g, // Merran API keys
  /\bsk-[A-Za-z0-9_-]{16,}/g, // OpenAI and Anthropic keys
  /\bAIza[0-9A-Za-z_-]{20,}/g, // Google keys
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, // tokens
  /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, // authorization headers
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/gi, // passwords in addresses
]

/** Invite links are keys too, until they're used. */
const INVITE = /\/join\/[^/?#\s"']+/g

export function scrubText(text: string): string {
  let scrubbed = text.replace(INVITE, "/join/[token]")
  for (const pattern of KEYS) {
    scrubbed = scrubbed.replace(pattern, "[redacted]")
  }
  return scrubbed
}

/** Keeps the error and where it happened, and nothing about who or what else. */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    event.request = event.request.url
      ? { url: scrubText(event.request.url) }
      : {}
  }
  delete event.user
  delete event.breadcrumbs
  if (event.message) event.message = scrubText(event.message)
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = scrubText(exception.value)
  }
  delete event.extra
  return event
}

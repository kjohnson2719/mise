import type { ErrorEvent } from "@sentry/node"

// What never leaves the server in an error report, whatever the error says.

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
  for (const pattern of KEYS) scrubbed = scrubbed.replace(pattern, "[redacted]")
  return scrubbed
}

function scrubDeep(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return scrubText(value)
  if (depth > 6 || value === null || typeof value !== "object") return value
  if (Array.isArray(value))
    return value.map((item) => scrubDeep(item, depth + 1))
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      scrubDeep(item, depth + 1),
    ])
  )
}

/**
 * Takes out of an error report anything that could identify someone or
 * unlock something: cookies, headers, bodies, who it was, the server's
 * name, and anything in the text that looks like a key.
 */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    event.request = {
      ...(event.request.method ? { method: event.request.method } : {}),
      ...(event.request.url ? { url: scrubText(event.request.url) } : {}),
    }
  }
  delete event.user
  delete event.server_name
  delete event.breadcrumbs
  if (event.message) event.message = scrubText(event.message)
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = scrubText(exception.value)
  }
  if (event.extra) event.extra = scrubDeep(event.extra) as typeof event.extra
  if (event.contexts) {
    event.contexts = scrubDeep(event.contexts) as typeof event.contexts
  }
  return event
}

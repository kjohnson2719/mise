import type { ApiKeyPermissions } from "./queries"

/** What a key can be given access to, in the order they're shown. */
export const AREAS = [
  "household",
  "recipes",
  "plan",
  "list",
  "pantry",
  "imports",
  "assistant",
] as const satisfies readonly (keyof ApiKeyPermissions)[]

export type Area = (typeof AREAS)[number]

/** The household can only ever be read with a key: changing it needs a sign-in. */
export const READ_ONLY_AREAS: readonly Area[] = ["household"]

import { ai } from "./ai/index.ts"
import { errorTracking } from "./error-tracking/index.ts"
import { nutrition } from "./nutrition/index.ts"
import { sites } from "./sites/index.ts"
import { stores } from "./stores/index.ts"
import type { Module } from "./module.ts"
import { photos } from "./photos/index.ts"
import { telemetry } from "./telemetry/index.ts"
import { video } from "./video/index.ts"
import { voice } from "./voice/index.ts"
import { updates } from "./updates/index.ts"

/** Every module, in the order Settings lists them. */
export const MODULES: readonly Module[] = [
  ai,
  video,
  nutrition,
  sites,
  photos,
  voice,
  stores,
  errorTracking,
  telemetry,
  updates,
]

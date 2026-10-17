import { z } from "zod"
import { numberSetting, textSetting } from "../../core/settings.ts"

export const ERROR_TRACKING = {
  dsn: textSetting({
    key: "errorTracking.dsn",
    env: "MERRAN_SENTRY_DSN",
    description:
      "Where to send errors: the DSN from Sentry, GlitchTip or Bugsink. Unset, errors stay in the server's log.",
    schema: z.url({
      protocol: /^https?$/,
      error: "Use the DSN your error tracker gives you, starting with https://",
    }),
  }),
  environment: textSetting({
    key: "errorTracking.environment",
    env: "MERRAN_SENTRY_ENVIRONMENT",
    description:
      "The environment errors are filed under, to tell servers apart.",
    schema: z.string().trim().min(1, "Give it a name.").max(64),
    default: "production",
  }),
  sampleRate: numberSetting({
    key: "errorTracking.sampleRate",
    env: "MERRAN_SENTRY_SAMPLE_RATE",
    description: "The share of errors to send, from 0 (none) to 1 (all).",
    schema: z
      .number()
      .min(0, "Use a number from 0 to 1.")
      .max(1, "Use a number from 0 to 1."),
    default: 1,
  }),
}

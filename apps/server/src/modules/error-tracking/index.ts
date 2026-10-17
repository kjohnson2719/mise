import type { Module, ModuleContext } from "../module.ts"
import { configureReporter } from "./reporter.ts"
import { ERROR_TRACKING } from "./settings.ts"

async function options({ settings, config }: ModuleContext) {
  return {
    dsn: await settings.server(ERROR_TRACKING.dsn),
    environment: await settings.server(ERROR_TRACKING.environment),
    sampleRate: await settings.server(ERROR_TRACKING.sampleRate),
    release: `merran@${config.version}`,
  }
}

/** Errors sent to the operator's own Sentry, GlitchTip or Bugsink. */
export const errorTracking: Module = {
  id: "errorTracking",
  settings: Object.values(ERROR_TRACKING),

  async status({ settings }) {
    return (await settings.server(ERROR_TRACKING.dsn))
      ? { on: true }
      : { on: false, needs: "dsn" }
  },

  // The browser reports its own errors to the same place.
  async client(ctx) {
    const { dsn, environment, sampleRate, release } = await options(ctx)
    return { dsn, environment, sampleRate, release }
  },

  async apply(ctx) {
    await configureReporter(await options(ctx), ctx.logger)
  },
}

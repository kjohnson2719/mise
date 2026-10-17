import type { Logger } from "pino"
import type { Config } from "../core/config.ts"
import type { AnySetting } from "../core/settings.ts"
import type { Database } from "../database/orm.ts"
import type { Settings } from "../services/settings/settings.ts"
import type { VideoTools } from "../services/video/tools.ts"

/** What a module can use to decide whether it's on, and to do its work. */
export type ModuleContext = {
  config: Config
  logger: Logger
  database: Database
  settings: Settings
  /** yt-dlp and ffmpeg, for video import. */
  video: VideoTools
}

/**
 * Whether a module is on. When it's off, `needs` says why, as a stable code
 * the web app explains: "dsn" for error tracking without an address, say.
 */
export type ModuleStatus = { on: true } | { on: false; needs: string }

/**
 * Something optional, like error tracking or AI: off until it has what it
 * needs. Each one declares, in one place, its settings, when it's on, and
 * what it makes possible (see docs/platform.md, "Modules").
 */
export type Module = {
  /** "errorTracking": also the start of its settings' keys. */
  id: string
  settings: readonly AnySetting[]
  status(ctx: ModuleContext): Promise<ModuleStatus>
  /**
   * What the web app may offer while it's on, like "ai.chat": a list, or
   * worked out from its settings when parts of it can be on alone.
   */
  capabilities?:
    readonly string[] | ((ctx: ModuleContext) => Promise<readonly string[]>)
  /**
   * What the web app needs while it's on, like where to send its errors.
   * Anyone can read this, before signing in too, so never a secret.
   */
  client?(ctx: ModuleContext): Promise<Record<string, unknown>>
  /** Runs at start, and again when one of its settings changes. */
  apply?(ctx: ModuleContext): Promise<void>
}

/** Applies each module at start, and again whenever its settings change. */
export async function startModules(
  modules: readonly Module[],
  ctx: ModuleContext
) {
  for (const module of modules) {
    if (!module.apply) continue
    const apply = module.apply.bind(module)
    const keys = new Set(module.settings.map((setting) => setting.key))
    await apply(ctx)
    ctx.settings.onChange(async (changed) => {
      if (changed.some((key) => keys.has(key))) await apply(ctx)
    })
  }
}

/** Which modules are on, what they make possible, and what the web app needs. */
export async function describeModules(
  modules: readonly Module[],
  ctx: ModuleContext
) {
  const described = await Promise.all(
    modules.map(async (module) => {
      const status = await module.status(ctx)
      const capabilities = !status.on
        ? []
        : typeof module.capabilities === "function"
          ? await module.capabilities(ctx)
          : (module.capabilities ?? [])
      return {
        module,
        capabilities,
        state: status.on
          ? { id: module.id, on: true }
          : { id: module.id, on: false, needs: status.needs },
        client:
          status.on && module.client ? await module.client(ctx) : undefined,
      }
    })
  )
  return {
    modules: described.map(({ state }) => state),
    capabilities: described.flatMap(({ capabilities }) => [...capabilities]),
    client: Object.fromEntries(
      described.flatMap(({ module, client }) =>
        client ? [[module.id, client]] : []
      )
    ),
  }
}

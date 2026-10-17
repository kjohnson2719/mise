import { tmpdir } from "node:os"
import { join } from "node:path"
import { pino } from "pino"
import { createApp } from "../../app.ts"
import { loadConfig } from "../../core/config.ts"
import { migrate, openDatabase } from "../../database/orm.ts"
import { MODULES } from "../../modules/index.ts"
import { createAuth } from "../../services/auth/auth.ts"
import { SetupCode } from "../../services/auth/setup-code.ts"
import { createMediaMakers } from "../../services/ai/media.ts"
import { createPublicFetcher } from "../../services/fetch/public-fetch.ts"
import {
  createAiModels,
  createTranscriber,
} from "../../services/ai/providers.ts"
import { JobRunner } from "../../services/jobs/runner.ts"
import { createEventBus } from "../../services/events/events.ts"
import { createSettings } from "../../services/settings/settings.ts"
import { LocalFileStore } from "../../services/storage/files.ts"
import { NO_VIDEO_TOOLS } from "../../services/video/tools.ts"
import { buildOpenApiDocument, DEFAULT_SERVER_URL } from "./document.ts"

/**
 * The API reference as it's published: built from a throwaway app, so it's
 * the same whoever makes it and wherever it's made.
 */
export async function createOpenApiFile(): Promise<string> {
  const config = {
    ...loadConfig({}),
    database: { kind: "sqlite" as const, file: ":memory:" },
    publicUrl: DEFAULT_SERVER_URL,
  }
  const database = await openDatabase(config.database)
  try {
    await migrate(database)
    const secret = "only used to describe the API, never to sign anything"
    const logger = pino({ level: "silent" })
    const auth = createAuth({ config, database, secret })
    const settings = createSettings({
      database,
      logger,
      secret,
      definitions: MODULES.flatMap((module) => module.settings),
      fromEnv: config.fromEnv,
    })
    // Describing the API never stores, fetches or runs anything.
    const files = new LocalFileStore(join(tmpdir(), "merran-openapi"))
    const fetcher = createPublicFetcher({ version: config.version })
    const ai = createAiModels()
    const transcribe = createTranscriber()
    const media = createMediaMakers()
    const video = NO_VIDEO_TOOLS
    const events = createEventBus()
    const app = createApp({
      config,
      logger,
      database,
      auth,
      setupCode: new SetupCode(),
      settings,
      modules: MODULES,
      files,
      fetcher,
      ai,
      transcribe,
      media,
      video,
      jobs: new JobRunner({
        deps: {
          config,
          logger,
          database,
          settings,
          modules: MODULES,
          files,
          fetcher,
          ai,
          transcribe,
          media,
          video,
          events,
        },
        handlers: [],
      }),
      events,
    })
    const document = await buildOpenApiDocument(app, auth, {
      version: config.version,
      serverUrl: DEFAULT_SERVER_URL,
    })
    return `${JSON.stringify(document, null, 2)}\n`
  } finally {
    await database.close()
  }
}

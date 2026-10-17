import { serve } from "@hono/node-server"
import { join } from "node:path"
import { createApp } from "./app.ts"
import { createAuth } from "./services/auth/auth.ts"
import { SetupCode } from "./services/auth/setup-code.ts"
import { loadConfig, type Config } from "./core/config.ts"
import { createLogger } from "./core/logger.ts"
import { loadSecret } from "./core/secret.ts"
import { User } from "./database/entities/index.ts"
import { migrate, openDatabase, type Database } from "./database/orm.ts"
import { MODULES } from "./modules/index.ts"
import { startModules } from "./modules/module.ts"
import { createPublicFetcher } from "./services/fetch/public-fetch.ts"
import { createMediaMakers } from "./services/ai/media.ts"
import { createAiModels, createTranscriber } from "./services/ai/providers.ts"
import { createEventBus } from "./services/events/events.ts"
import { JOB_HANDLERS, JOB_SCHEDULES } from "./services/jobs/handlers.ts"
import { JobRunner } from "./services/jobs/runner.ts"
import { rekeyFoodsSoon } from "./services/list/rekey.ts"
import { createSettings } from "./services/settings/settings.ts"
import { LocalFileStore } from "./services/storage/files.ts"
import { createVideoTools } from "./services/video/tools.ts"
import { checkUpdatesSoon } from "./modules/updates/check.ts"

let config: Config
try {
  config = loadConfig()
} catch (err) {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
}

const logger = createLogger(config)

let database: Database
try {
  database = await openDatabase(config.database)
  const applied = await migrate(database)
  if (applied.length > 0) {
    logger.info({ migrations: applied }, "Updated the database")
  }
} catch (err) {
  logger.fatal({ err }, "Couldn't open the database")
  process.exit(1)
}
logger.info(
  config.database.kind === "sqlite"
    ? `Using SQLite at ${config.database.file}`
    : "Using Postgres"
)

const secret = loadSecret(config)
const auth = createAuth({ config, database, secret, logger })
const settings = createSettings({
  database,
  logger,
  secret,
  definitions: MODULES.flatMap((module) => module.settings),
  fromEnv: config.fromEnv,
})
const video = createVideoTools({ dataDir: config.dataDir, settings, logger })
await startModules(MODULES, { config, logger, database, settings, video })

// A fresh server is claimed with a code from this log, so a stranger who
// finds the page first can't take it.
const setupCode = new SetupCode()
if ((await database.em.fork().count(User)) === 0) {
  logger.info(
    `Set up Merran in the browser with this code: ${setupCode.issue()}`
  )
}

const files = new LocalFileStore(join(config.dataDir, "files"))
const fetcher = createPublicFetcher({ version: config.version })
const ai = createAiModels()
const transcribe = createTranscriber()
const media = createMediaMakers()
const events = createEventBus()
const jobs = new JobRunner({
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
  handlers: JOB_HANDLERS,
  schedules: JOB_SCHEDULES,
})

const app = createApp({
  config,
  logger,
  database,
  auth,
  setupCode,
  settings,
  modules: MODULES,
  files,
  fetcher,
  ai,
  transcribe,
  media,
  video,
  jobs,
  events,
})

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  logger.info(`Merran ${config.version} is listening on port ${info.port}`)
})
await jobs.start()
// Food keys made a new way: the ones kept are made again, once.
await rekeyFoodsSoon(database.em.fork())
// A look for a newer release, rather than waiting for the next 6 hours.
await checkUpdatesSoon(database.em.fork())

function shutDown(signal: NodeJS.Signals) {
  logger.info(`${signal}: shutting down`)
  // Live pages reconnect to the next server.
  events.closeAll()
  server.close(() => {
    // Jobs stopped now run again at the next start.
    void jobs
      .stop()
      .then(() => database.close())
      .finally(() => process.exit(0))
  })
  // Don't wait forever on open connections.
  setTimeout(() => process.exit(0), 5_000).unref()
}

process.once("SIGINT", shutDown)
process.once("SIGTERM", shutDown)

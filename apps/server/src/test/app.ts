import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join as joinPath } from "node:path"
import { pino } from "pino"
import { createApp, type App } from "../app.ts"
import { MODULES } from "../modules/index.ts"
import { startModules, type Module } from "../modules/module.ts"
import type { MediaMakers } from "../services/ai/media.ts"
import type { AiModels, Transcriber } from "../services/ai/providers.ts"
import type { Fetcher } from "../services/fetch/public-fetch.ts"
import { JOB_HANDLERS } from "../services/jobs/handlers.ts"
import { JobRunner, type JobHandler } from "../services/jobs/runner.ts"
import { createSettings } from "../services/settings/settings.ts"
import { LocalFileStore } from "../services/storage/files.ts"
import { NO_VIDEO_TOOLS, type VideoTools } from "../services/video/tools.ts"
import { createAuth } from "../services/auth/auth.ts"
import { SetupCode } from "../services/auth/setup-code.ts"
import { createEventBus } from "../services/events/events.ts"
import { loadConfig } from "../core/config.ts"
import { createTestDatabase } from "./database.ts"

export const TEST_ORIGIN = "http://merran.test"
export const TEST_PASSWORD = "correct horse battery"

export const TEST_SECRET = "a test secret that is long enough to use"

/**
 * The whole app on a fresh test database. Close it when the tests are done.
 * Tests can add modules of their own, and set module settings as if from
 * the environment.
 */
export async function createTestApp(
  options: {
    modules?: readonly Module[]
    env?: Record<string, string>
    /** What fetching from the internet answers with. Tests never reach it. */
    fetcher?: Fetcher
    /** The AI models to call. Tests never reach a provider. */
    ai?: AiModels
    /** Speech to text. Tests never reach a provider. */
    transcribe?: Transcriber
    /** Pictures and speech. Tests never reach a provider. */
    media?: MediaMakers
    /** yt-dlp and ffmpeg. By default they aren't there. */
    video?: VideoTools
    /** Kinds of job beyond Merran's own, for tests of the runner. */
    jobHandlers?: readonly JobHandler[]
  } = {}
) {
  const {
    database,
    config: databaseConfig,
    close: closeDatabase,
  } = await createTestDatabase()
  const filesDir = mkdtempSync(joinPath(tmpdir(), "merran-files-"))
  const close = async () => {
    await closeDatabase()
    rmSync(filesDir, { recursive: true, force: true })
  }
  const modules = [...MODULES, ...(options.modules ?? [])]
  const definitions = modules.flatMap((module) => module.settings)
  const config = {
    ...loadConfig(options.env ?? {}, definitions),
    database: databaseConfig,
    secret: TEST_SECRET,
    publicUrl: TEST_ORIGIN,
    webDir: null,
    // Uploads and the like go in the test's own folder, never the repo's.
    dataDir: filesDir,
  }
  const logger = pino({ level: "silent" })
  const auth = createAuth({ config, database, secret: TEST_SECRET })
  const settings = createSettings({
    database,
    logger,
    secret: TEST_SECRET,
    definitions,
    fromEnv: config.fromEnv,
  })
  const video = options.video ?? NO_VIDEO_TOOLS
  const transcribe: Transcriber =
    options.transcribe ??
    (() => Promise.reject(new Error("Tests don't reach AI providers.")))
  const media: MediaMakers = options.media ?? {
    image: () => Promise.reject(new Error("Tests don't reach AI providers.")),
    speech: () => Promise.reject(new Error("Tests don't reach AI providers.")),
  }
  await startModules(modules, { config, logger, database, settings, video })
  const setupCode = new SetupCode()
  const files = new LocalFileStore(filesDir)
  const fetcher: Fetcher =
    options.fetcher ??
    (() => Promise.reject(new Error("Tests don't reach the internet.")))
  const events = createEventBus()
  const ai: AiModels =
    options.ai ??
    (() => {
      throw new Error("Tests don't reach AI providers.")
    })
  // Not started: tests run what's waiting with `jobs.drain()`.
  const jobs = new JobRunner({
    deps: {
      config,
      logger,
      database,
      settings,
      modules,
      files,
      fetcher,
      ai,
      transcribe,
      media,
      video,
      events,
    },
    handlers: [...JOB_HANDLERS, ...(options.jobHandlers ?? [])],
  })
  const app = createApp({
    config,
    logger,
    database,
    auth,
    setupCode,
    settings,
    modules,
    files,
    fetcher,
    ai,
    transcribe,
    media,
    video,
    jobs,
    events,
  })
  return {
    app,
    database,
    auth,
    setupCode,
    settings,
    filesDir,
    jobs,
    events,
    close,
  }
}

/** A response whose JSON tests can read without declaring its type. */
export type TestResponse = Omit<Response, "json"> & {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json(): Promise<any>
}

/** One person's browser: it keeps their cookies between requests. */
export class TestClient {
  readonly app: App
  readonly cookies = new Map<string, string>()
  /** Which device this is, sent with each request as the web app does. */
  client: string | null = null

  constructor(app: App) {
    this.app = app
  }

  async request(
    method: string,
    path: string,
    body?: unknown
  ): Promise<TestResponse> {
    return this.send(
      method,
      path,
      body === undefined
        ? undefined
        : { body: JSON.stringify(body), type: "application/json" }
    )
  }

  /** Sends a file as the body, like a photo. */
  upload(path: string, body: Uint8Array, type: string, method = "PUT") {
    return this.send(method, path, { body, type })
  }

  async send(
    method: string,
    path: string,
    content?: { body: string | Uint8Array; type: string }
  ): Promise<TestResponse> {
    const headers = this.headers()
    if (content) headers.set("content-type", content.type)

    const res = await this.app.request(`${TEST_ORIGIN}${path}`, {
      method,
      headers,
      ...(content ? { body: content.body } : {}),
    })
    for (const cookie of res.headers.getSetCookie()) {
      const [pair = ""] = cookie.split(";")
      const [name = "", ...rest] = pair.split("=")
      const value = rest.join("=")
      if (value === "" || /max-age=0/i.test(cookie)) this.cookies.delete(name)
      else this.cookies.set(name, value)
    }
    return res
  }

  /** The headers a request from this client starts with: its cookies too. */
  headers() {
    const headers = new Headers({ origin: TEST_ORIGIN })
    if (this.client) headers.set("x-merran-client", this.client)
    if (this.cookies.size > 0) {
      headers.set(
        "cookie",
        [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ")
      )
    }
    return headers
  }

  get(path: string) {
    return this.request("GET", path)
  }
  post(path: string, body?: unknown) {
    return this.request("POST", path, body ?? {})
  }
  patch(path: string, body: unknown) {
    return this.request("PATCH", path, body)
  }
  put(path: string, body: unknown) {
    return this.request("PUT", path, body)
  }
  delete(path: string) {
    return this.request("DELETE", path)
  }
}

export type TestAccount = {
  name: string
  email: string
  username: string
  password: string
}

export function account(username: string, name = username): TestAccount {
  return {
    name,
    email: `${username}@example.com`,
    username,
    password: TEST_PASSWORD,
  }
}

/** Sets the server up through the API: its first person, signed in. */
export async function setUpServer(
  app: App,
  setupCode: SetupCode,
  owner: TestAccount = account("kyle", "Kyle"),
  household = "Home"
) {
  const client = new TestClient(app)
  const res = await client.post("/api/auth/setup", {
    ...owner,
    code: setupCode.issue(),
    household,
  })
  if (res.status !== 201) {
    throw new Error(`Setup failed: ${res.status} ${await res.text()}`)
  }
  return client
}

/** Makes an invite link as `admin`, and returns its token. */
export async function inviteToken(admin: TestClient, role = "member") {
  const res = await admin.post("/api/households/current/invites", { role })
  if (res.status !== 201) {
    throw new Error(`Invite failed: ${res.status} ${await res.text()}`)
  }
  const { link } = (await res.json()) as { link: string }
  return link.split("/join/")[1]!
}

/** Someone new joins through an invite link, signed in afterwards. */
export async function join(app: App, token: string, who: TestAccount) {
  const client = new TestClient(app)
  const res = await client.post(`/api/auth/join/${token}`, { account: who })
  if (res.status !== 201) {
    throw new Error(`Join failed: ${res.status} ${await res.text()}`)
  }
  return client
}

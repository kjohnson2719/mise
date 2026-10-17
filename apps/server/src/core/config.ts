import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { z } from "zod"
import { MODULE_SETTINGS } from "../modules/settings.ts"
import {
  choiceSetting,
  listSetting,
  numberSetting,
  readEnvironment,
  secretSetting,
  textSetting,
  type AnySetting,
  type ValueOf,
} from "./settings.ts"

const LOG_LEVELS = [
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
] as const

/**
 * What the server needs before anything else starts, so these come only from
 * the environment. Modules' settings are in their own folders.
 */
export const BOOT_SETTINGS = {
  port: numberSetting({
    key: "server.port",
    env: "PORT",
    envOnly: true,
    description: "The port Merran listens on.",
    schema: z.number().int().min(1).max(65_535),
    default: 3000,
  }),
  logLevel: choiceSetting({
    key: "server.logLevel",
    env: "MERRAN_LOG_LEVEL",
    envOnly: true,
    description:
      "How much goes in the log. `debug` helps with troubleshooting.",
    choices: LOG_LEVELS,
    default: "info",
  }),
  logFormat: choiceSetting({
    key: "server.logFormat",
    env: "MERRAN_LOG_FORMAT",
    envOnly: true,
    description:
      "`auto` is readable lines in a terminal and JSON everywhere else.",
    choices: ["auto", "pretty", "json"],
    default: "auto",
  }),
  dataDir: textSetting({
    key: "server.dataDir",
    env: "MERRAN_DATA_DIR",
    envOnly: true,
    description:
      "Where Merran keeps its files, and its SQLite database when there's no Postgres.",
    default: "data",
  }),
  databaseUrl: textSetting({
    key: "server.databaseUrl",
    env: "DATABASE_URL",
    envOnly: true,
    description: "A Postgres address. Leave it unset to use SQLite.",
    schema: z
      .string()
      .regex(
        /^postgres(ql)?:\/\//,
        "Use a postgres:// address, or leave it unset to use SQLite"
      ),
  }),
  secret: secretSetting({
    key: "server.secret",
    env: "MERRAN_SECRET",
    envOnly: true,
    description:
      "Signs sessions and seals saved keys. Unset: made once and kept in the data folder.",
    schema: z.string().min(32, "Use at least 32 characters"),
  }),
  publicUrl: textSetting({
    key: "server.publicUrl",
    env: "MERRAN_PUBLIC_URL",
    envOnly: true,
    description:
      "The address people use to reach Merran, like https://merran.example.com.",
    schema: z.url({ protocol: /^https?$/ }),
  }),
  trustedProxies: listSetting({
    key: "server.trustedProxies",
    env: "MERRAN_TRUSTED_PROXIES",
    envOnly: true,
    description:
      'Proxies in front of Merran whose X-Forwarded-For is believed: addresses or ranges, separated by commas ("172.16.0.0/12, 127.0.0.1").',
    item: z.union([z.ipv4(), z.ipv6(), z.cidrv4(), z.cidrv6()], {
      error: "Use IP addresses or ranges, like 172.16.0.0/12",
    }),
    default: [],
  }),
  version: textSetting({
    key: "server.version",
    env: "MERRAN_VERSION",
    envOnly: true,
    description:
      "The release this is: the Docker image sets it. From source, it's the server package's version.",
  }),
  installMethod: choiceSetting({
    key: "server.installMethod",
    env: "MERRAN_INSTALL_METHOD",
    envOnly: true,
    description: "How Merran was installed. The Docker image sets it.",
    choices: ["source", "docker"],
    default: "source",
  }),
}

export type LogLevel = (typeof LOG_LEVELS)[number]

export type DatabaseConfig =
  { kind: "sqlite"; file: string } | { kind: "postgres"; url: string }

export type Config = {
  version: string
  installMethod: "source" | "docker"
  port: number
  logLevel: LogLevel
  logFormat: "pretty" | "json"
  dataDir: string
  database: DatabaseConfig
  /** From MERRAN_SECRET; when unset, the server keeps one in the data folder. */
  secret: string | undefined
  publicUrl: string | undefined
  trustedProxies: string[]
  /** The built web app to serve, or null to serve only the API. */
  webDir: string | null
  /** Module settings set in the environment, by key. They can't be changed in the app. */
  fromEnv: ReadonlyMap<string, unknown>
}

/** Where `pnpm --filter @merran/web build` puts the web app. */
const WEB_DIR = fileURLToPath(new URL("../../../web/dist", import.meta.url))

const packageJson = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8")
) as { version: string }

/**
 * Reads the settings, or throws one error listing everything that's wrong.
 * An empty variable (`PORT=`) counts as not set. Only the variables the
 * settings name are read.
 */
export function loadConfig(
  env: Record<string, string | undefined> = process.env,
  moduleSettings: readonly AnySetting[] = MODULE_SETTINGS
): Config {
  const boot = Object.values(BOOT_SETTINGS)
  const { values, problems } = readEnvironment(
    [...boot, ...moduleSettings],
    env
  )
  if (problems.length > 0) {
    throw new Error(
      `Merran can't start, because of these settings:\n${problems.join("\n")}`
    )
  }
  const read = <S extends AnySetting>(setting: S) =>
    (values.has(setting.key)
      ? values.get(setting.key)
      : setting.default) as ValueOf<S>

  const dataDir = resolve(read(BOOT_SETTINGS.dataDir))
  const databaseUrl = read(BOOT_SETTINGS.databaseUrl)
  const logFormat = read(BOOT_SETTINGS.logFormat)
  const bootKeys = new Set(boot.map((setting) => setting.key))

  return {
    version: read(BOOT_SETTINGS.version) ?? packageJson.version,
    installMethod: read(BOOT_SETTINGS.installMethod),
    port: read(BOOT_SETTINGS.port),
    logLevel: read(BOOT_SETTINGS.logLevel),
    logFormat:
      logFormat === "auto"
        ? process.stdout.isTTY
          ? "pretty"
          : "json"
        : logFormat,
    dataDir,
    database: databaseUrl
      ? { kind: "postgres", url: databaseUrl }
      : { kind: "sqlite", file: resolve(dataDir, "merran.db") },
    secret: read(BOOT_SETTINGS.secret) ?? undefined,
    publicUrl: read(BOOT_SETTINGS.publicUrl)?.replace(/\/$/, ""),
    trustedProxies: read(BOOT_SETTINGS.trustedProxies),
    webDir: WEB_DIR,
    fromEnv: new Map([...values].filter(([key]) => !bootKeys.has(key))),
  }
}

import { pino, type Logger } from "pino"
import type { Config } from "./config.ts"

/** Keys whose values never reach the logs, wherever they turn up. */
const REDACTED = [
  "authorization",
  "cookie",
  "password",
  "apiKey",
  "token",
  "secret",
].flatMap((key) => [key, `*.${key}`])

export function createLogger(
  config: Pick<Config, "logLevel" | "logFormat">
): Logger {
  return pino({
    level: config.logLevel,
    redact: { paths: REDACTED, censor: "[redacted]" },
    ...(config.logFormat === "pretty"
      ? {
          transport: {
            target: "pino-pretty",
            options: { translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname" },
          },
        }
      : {}),
  })
}

import { randomBytes } from "node:crypto"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import type { Config } from "./config.ts"

export function secretFile(dataDir: string) {
  return join(dataDir, "secret")
}

/** A new random secret, as made on first start. */
export function newSecret() {
  return randomBytes(32).toString("hex")
}

/**
 * The server's secret: MERRAN_SECRET, or one made on first start and kept in
 * the data folder. It signs sessions and seals saved keys, so losing it signs
 * everyone out and loses the keys: it's backed up with the data folder.
 */
export function loadSecret(config: Pick<Config, "secret" | "dataDir">): string {
  if (config.secret) return config.secret

  const file = secretFile(config.dataDir)
  if (existsSync(file)) return readFileSync(file, "utf8").trim()

  const secret = newSecret()
  writeSecretFile(config.dataDir, secret)
  return secret
}

/** Replaces the secret in the data folder all at once, never half written. */
export function writeSecretFile(dataDir: string, secret: string) {
  mkdirSync(dataDir, { recursive: true })
  const file = secretFile(dataDir)
  const next = `${file}.next`
  writeFileSync(next, secret, { mode: 0o600 })
  renameSync(next, file)
}

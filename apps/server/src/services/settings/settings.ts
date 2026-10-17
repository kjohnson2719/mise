import { ref } from "@mikro-orm/core"
import type { EntityManager } from "@mikro-orm/sql"
import type { Logger } from "pino"
import type {
  AnySetting,
  SettingKind,
  SettingLevel,
  ValueOf,
} from "../../core/settings.ts"
import type { Database } from "../../database/orm.ts"
import {
  HouseholdSetting,
  Secret,
  ServerSetting,
  User,
} from "../../database/entities/index.ts"
import { forHousehold, HOUSEHOLD_FILTER } from "../../database/scope.ts"
import { AppError } from "../../core/errors.ts"
import {
  SecretBox,
  UnreadableSecretError,
  type Sealed,
} from "../secrets/secret-box.ts"

export type SettingSource = "default" | "saved" | "environment"

/** A setting as Settings shows it. A secret's value never leaves the server. */
export type SettingState = {
  key: string
  kind: SettingKind
  /** Its value, or null for a secret or a setting that isn't set. */
  value: unknown
  default: unknown
  source: SettingSource
  /** The environment variable that sets it, when it does: then it can't be changed in the app. */
  lockedBy: string | null
  /** For a secret: whether there is one, and its last four characters. */
  secret?: { set: boolean; hint: string | null; unreadable: boolean }
  choices?: string[]
}

/** A saved value: a secret's sealed value, or anything else as it is. */
type Stored = { value: unknown; sealed: Sealed | null }

/** Called after settings change, with the keys that changed. */
type Listener = (keys: string[]) => void | Promise<void>

/** Shows the end of a secret, if it's long enough that this gives nothing away. */
function hintFor(secret: string) {
  return secret.length >= 12 ? secret.slice(-4) : null
}

function sealedOf(secret: Secret | null | undefined): Sealed | null {
  return secret
    ? { keyId: secret.keyId, dataKey: secret.dataKey, value: secret.value }
    : null
}

/**
 * Every setting's value, from the environment, as saved in the app, or its
 * default, in that order. Server settings are kept in memory; household
 * settings are read when asked for.
 */
export class Settings {
  readonly #database: Database
  readonly #box: SecretBox
  readonly #logger: Logger
  readonly #byKey: ReadonlyMap<string, AnySetting>
  readonly #fromEnv: ReadonlyMap<string, unknown>
  readonly #listeners = new Set<Listener>()
  #server: Promise<Map<string, Stored>> | null = null

  constructor(options: {
    database: Database
    box: SecretBox
    logger: Logger
    definitions: readonly AnySetting[]
    fromEnv: ReadonlyMap<string, unknown>
  }) {
    this.#database = options.database
    this.#box = options.box
    this.#logger = options.logger
    this.#byKey = new Map(options.definitions.map((s) => [s.key, s]))
    this.#fromEnv = options.fromEnv
  }

  /**
   * Seals a secret that isn't a setting, like a token a job needs while it
   * runs, so it can't be read from the database alone.
   */
  seal(value: string): Sealed {
    return this.#box.seal(value)
  }

  /** Opens what `seal` sealed. */
  open(sealed: Sealed): string {
    return this.#box.open(sealed)
  }

  /** Every setting at a level that Settings shows. */
  definitions(level: SettingLevel): AnySetting[] {
    return [...this.#byKey.values()].filter(
      (setting) =>
        setting.level === level && !setting.internal && !setting.envOnly
    )
  }

  /** Runs after any setting changes. Returns a function that stops it. */
  onChange(listener: Listener): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  // ---- Reading ----

  /** A server setting's value. */
  async server<S extends AnySetting>(setting: S): Promise<ValueOf<S>> {
    this.#check(setting, "server")
    if (this.#fromEnv.has(setting.key)) {
      return this.#fromEnv.get(setting.key) as ValueOf<S>
    }
    const stored = (await this.#loadServer()).get(setting.key)
    return this.#valueOf(setting, stored) as ValueOf<S>
  }

  /** A household setting's value, for one household. */
  async household<S extends AnySetting>(
    em: EntityManager,
    householdId: string,
    setting: S
  ): Promise<ValueOf<S>> {
    this.#check(setting, "household")
    const rows = await this.#householdRows(em, householdId)
    return this.#valueOf(setting, rows.get(setting.key)) as ValueOf<S>
  }

  async describeServer(): Promise<SettingState[]> {
    const saved = await this.#loadServer()
    return this.definitions("server").map((setting) =>
      this.#describe(setting, saved.get(setting.key))
    )
  }

  async describeHousehold(
    em: EntityManager,
    householdId: string
  ): Promise<SettingState[]> {
    const rows = await this.#householdRows(em, householdId)
    return this.definitions("household").map((setting) =>
      this.#describe(setting, rows.get(setting.key))
    )
  }

  // ---- Saving ----

  /**
   * Saves server settings changed in the app: each key's new value, or null
   * to go back to its default. Checks everything first and changes nothing
   * if anything is wrong.
   */
  async saveServer(
    em: EntityManager,
    changes: Record<string, unknown>,
    userId: string | null
  ): Promise<void> {
    const checked = this.#checkChanges("server", changes)
    await em.transactional(async (tx) => {
      for (const [setting, value] of checked) {
        await this.#writeServer(tx, setting, value, userId)
      }
    })
    await this.#changed(checked.map(([setting]) => setting.key))
  }

  async saveHousehold(
    em: EntityManager,
    householdId: string,
    changes: Record<string, unknown>,
    userId: string | null
  ): Promise<void> {
    const checked = this.#checkChanges("household", changes)
    await em.transactional(async (tx) => {
      // Scoped here rather than with forHousehold(), which would leave the transaction.
      tx.setFilterParams(HOUSEHOLD_FILTER, { householdId })
      for (const [setting, value] of checked) {
        const row = await tx.findOne(
          HouseholdSetting,
          { key: setting.key },
          { populate: ["secret"] }
        )
        if (value === null) {
          if (row) await this.#remove(tx, row)
          continue
        }
        const target =
          row ??
          tx.create(HouseholdSetting, {
            household: householdId,
            key: setting.key,
            value: null,
          })
        await this.#fill(tx, target, setting, value, userId)
      }
    })
    await this.#changed(checked.map(([setting]) => setting.key))
  }

  /**
   * Saves a value Merran keeps for itself, like the telemetry install id.
   * Trusted code only: it skips the checks for people's changes.
   */
  async keepServer<S extends AnySetting>(
    em: EntityManager,
    setting: S,
    value: ValueOf<S>
  ): Promise<void> {
    this.#check(setting, "server")
    await em.transactional((tx) => this.#writeServer(tx, setting, value, null))
    await this.#changed([setting.key])
  }

  // ---- Inside ----

  #check(setting: AnySetting, level: SettingLevel) {
    if (this.#byKey.get(setting.key) !== setting) {
      throw new Error(`${setting.key} isn't a known setting`)
    }
    if (setting.level !== level) {
      throw new Error(`${setting.key} is a ${setting.level} setting`)
    }
  }

  #checkChanges(
    level: SettingLevel,
    changes: Record<string, unknown>
  ): [AnySetting, unknown][] {
    const fields: Record<string, string> = {}
    const checked: [AnySetting, unknown][] = []
    for (const [key, value] of Object.entries(changes)) {
      const setting = this.#byKey.get(key)
      if (
        !setting ||
        setting.level !== level ||
        setting.internal ||
        setting.envOnly
      ) {
        fields[key] = "There's no such setting here."
        continue
      }
      if (setting.env && this.#fromEnv.has(key)) {
        fields[key] = `Set on the server, by ${setting.env}.`
        continue
      }
      if (value === null) {
        checked.push([setting, null])
        continue
      }
      const result = setting.schema.safeParse(value)
      if (result.success) {
        checked.push([setting, result.data])
      } else {
        fields[key] = result.error.issues[0]?.message ?? "That isn't right."
      }
    }
    if (Object.keys(fields).length > 0) {
      throw new AppError(
        "invalid",
        "invalid_settings",
        "Some settings need another look.",
        fields
      )
    }
    return checked
  }

  async #writeServer(
    tx: EntityManager,
    setting: AnySetting,
    value: unknown,
    userId: string | null
  ) {
    const row = await tx.findOne(
      ServerSetting,
      { key: setting.key },
      { populate: ["secret"] }
    )
    if (value === null) {
      if (row) await this.#remove(tx, row)
      return
    }
    const target =
      row ?? tx.create(ServerSetting, { key: setting.key, value: null })
    await this.#fill(tx, target, setting, value, userId)
  }

  async #fill(
    tx: EntityManager,
    row: ServerSetting | HouseholdSetting,
    setting: AnySetting,
    value: unknown,
    userId: string | null
  ) {
    row.updatedBy = userId
      ? tx.getReference(User, userId, { wrapped: true })
      : null
    if (setting.kind !== "secret") {
      row.value = value
      await tx.flush()
      return
    }
    const sealed = this.#box.seal(value as string)
    const secret = row.secret?.getEntity()
    if (secret) {
      Object.assign(secret, sealed)
    } else {
      row.secret = ref(tx.create(Secret, sealed))
    }
    row.value = null
    await tx.flush()
  }

  async #remove(tx: EntityManager, row: ServerSetting | HouseholdSetting) {
    const secret = row.secret?.getEntity()
    tx.remove(row)
    if (secret) tx.remove(secret)
    await tx.flush()
  }

  async #changed(keys: string[]) {
    this.#server = null
    for (const listener of this.#listeners) {
      try {
        await listener(keys)
      } catch (err) {
        this.#logger.error({ err, keys }, "Couldn't apply changed settings")
      }
    }
  }

  #loadServer(): Promise<Map<string, Stored>> {
    this.#server ??= (async () => {
      const em = this.#database.em.fork()
      const rows = await em.find(ServerSetting, {}, { populate: ["secret"] })
      return new Map(
        rows.map((row) => [
          row.key,
          { value: row.value, sealed: sealedOf(row.secret?.getEntity()) },
        ])
      )
    })().catch((err: unknown) => {
      this.#server = null
      throw err
    })
    return this.#server
  }

  async #householdRows(em: EntityManager, householdId: string) {
    const rows = await forHousehold(em, householdId).find(
      HouseholdSetting,
      {},
      { populate: ["secret"] }
    )
    return new Map<string, Stored>(
      rows.map((row) => [
        row.key,
        { value: row.value, sealed: sealedOf(row.secret?.getEntity()) },
      ])
    )
  }

  #valueOf(setting: AnySetting, stored: Stored | undefined): unknown {
    if (!stored) return setting.default
    if (setting.kind !== "secret") return stored.value ?? setting.default
    if (!stored.sealed) return setting.default
    try {
      return this.#box.open(stored.sealed)
    } catch (err) {
      if (!(err instanceof UnreadableSecretError)) throw err
      this.#logger.warn({ setting: setting.key }, err.message)
      return setting.default
    }
  }

  #describe(setting: AnySetting, stored: Stored | undefined): SettingState {
    const fromEnv = this.#fromEnv.has(setting.key)
    const source: SettingSource = fromEnv
      ? "environment"
      : stored
        ? "saved"
        : "default"
    const state: SettingState = {
      key: setting.key,
      kind: setting.kind,
      value: null,
      default: setting.kind === "secret" ? null : setting.default,
      source,
      lockedBy: fromEnv ? (setting.env ?? null) : null,
      ...(setting.choices ? { choices: [...setting.choices] } : {}),
    }
    if (setting.kind !== "secret") {
      state.value = fromEnv
        ? this.#fromEnv.get(setting.key)
        : this.#valueOf(setting, stored)
      return state
    }
    let secret: string | null = null
    let unreadable = false
    if (fromEnv) {
      secret = this.#fromEnv.get(setting.key) as string
    } else if (stored?.sealed) {
      try {
        secret = this.#box.open(stored.sealed)
      } catch (err) {
        if (!(err instanceof UnreadableSecretError)) throw err
        unreadable = true
      }
    }
    state.secret = {
      set: secret !== null || unreadable,
      hint: secret ? hintFor(secret) : null,
      unreadable,
    }
    return state
  }
}

/** The settings for a server, with its secrets sealed by the server's secret. */
export function createSettings(options: {
  database: Database
  logger: Logger
  /** The server's secret: MERRAN_SECRET, or the one in the data folder. */
  secret: string
  definitions: readonly AnySetting[]
  fromEnv: ReadonlyMap<string, unknown>
}): Settings {
  return new Settings({ ...options, box: new SecretBox(options.secret) })
}

import { z } from "zod"

// Every setting is described once, here or in its module: its environment
// variable, level, type, default and what it's for. Startup reads the
// environment with these, Settings shows and saves them, and the docs'
// configuration reference can be made from them.

/** Who a setting belongs to. Settings for each person arrive with their first one. */
export type SettingLevel = "server" | "household"

/** What sort of value it is, which decides how Settings shows it. */
export type SettingKind =
  "text" | "number" | "switch" | "choice" | "list" | "secret" | "json"

export type Setting<T = unknown, D extends T | null = T | null> = {
  /** The module, then the setting: "errorTracking.dsn". */
  key: string
  level: SettingLevel
  kind: SettingKind
  /** What it does, in a sentence, for the docs and the API reference. */
  description: string
  /** The environment variable that sets it. Setting it locks it in the app. */
  env?: string
  /** Read from the environment only, like the port: needed before the database opens. */
  envOnly?: boolean
  /** Kept by Merran itself, like the telemetry install id: never shown or changed in Settings. */
  internal?: boolean
  /** Checks a value saved in the app. */
  schema: z.ZodType<T>
  /** Reads its environment variable. */
  fromEnv: z.ZodType<T>
  /** Used when it isn't set anywhere. Null means "not set". */
  default: D
  /** For a choice: what it can be. */
  choices?: readonly string[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnySetting = Setting<any, any>

/** What reading a setting gives: its value, or its default. */
export type ValueOf<S> = S extends Setting<infer T, infer D> ? T | D : never

type Common = {
  key: string
  description: string
  level?: SettingLevel
  env?: string
  envOnly?: boolean
  internal?: boolean
}

function define<T, D extends T | null>(
  common: Common,
  rest: {
    kind: SettingKind
    schema: z.ZodType<T>
    fromEnv?: z.ZodType<T>
    default: D
    choices?: readonly string[]
  }
): Setting<T, D> {
  const level = common.level ?? "server"
  if (common.env && level !== "server") {
    throw new Error(
      `${common.key}: only server settings can come from the environment`
    )
  }
  return {
    key: common.key,
    description: common.description,
    level,
    ...(common.env ? { env: common.env } : {}),
    ...(common.envOnly ? { envOnly: true } : {}),
    ...(common.internal ? { internal: true } : {}),
    ...rest,
    fromEnv: rest.fromEnv ?? rest.schema,
  }
}

export function textSetting<D extends string | null = null>(
  options: Common & { schema?: z.ZodType<string>; default?: D }
) {
  return define<string, D>(options, {
    kind: "text",
    schema: options.schema ?? z.string().trim().min(1).max(2000),
    default: (options.default ?? null) as D,
  })
}

/** A secret, like a key or a password: kept sealed, and never sent back out. */
export function secretSetting(
  options: Common & { schema?: z.ZodType<string> }
) {
  return define<string, null>(options, {
    kind: "secret",
    schema: options.schema ?? z.string().trim().min(1).max(4000),
    default: null,
  })
}

export function numberSetting<D extends number | null = null>(
  options: Common & { schema: z.ZodType<number>; default?: D }
) {
  return define<number, D>(options, {
    kind: "number",
    schema: options.schema,
    fromEnv: z.coerce
      .number({ error: "Use a number" })
      // The schema checks any input, so a number will do.
      .pipe(options.schema as z.ZodType<number, number>),
    default: (options.default ?? null) as D,
  })
}

const YES = ["true", "1", "yes", "on"]
const NO = ["false", "0", "no", "off"]

export function switchSetting<D extends boolean>(
  options: Common & { default: D }
) {
  return define<boolean, D>(options, {
    kind: "switch",
    schema: z.boolean(),
    fromEnv: z
      .string()
      .trim()
      .toLowerCase()
      .refine((value) => YES.includes(value) || NO.includes(value), {
        error: "Use true or false (on and off work too)",
      })
      .transform((value) => YES.includes(value)),
    default: options.default,
  })
}

export function choiceSetting<
  const C extends readonly [string, ...string[]],
  D extends C[number] | null = null,
>(options: Common & { choices: C; default?: D }) {
  const schema = z.enum(options.choices, {
    error: `Use one of: ${options.choices.join(", ")}`,
  }) as unknown as z.ZodType<C[number]>
  return define<C[number], D>(options, {
    kind: "choice",
    schema,
    default: (options.default ?? null) as D,
    choices: options.choices,
  })
}

/**
 * Something with parts, like the AI policy: kept by Merran and changed
 * through its own routes, never set from the environment.
 */
export function jsonSetting<T>(
  options: Omit<Common, "env" | "envOnly"> & {
    schema: z.ZodType<T>
    default: T
  }
) {
  return define<T, T>(options, {
    kind: "json",
    schema: options.schema,
    default: options.default,
  })
}

/** A list, written in the environment with commas between: "a, b, c". */
export function listSetting<D extends string[] | null = null>(
  options: Common & { item: z.ZodType<string>; default?: D }
) {
  const schema = z.array(options.item)
  return define<string[], D>(options, {
    kind: "list",
    schema,
    fromEnv: z
      .string()
      .transform((value) =>
        value
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean)
      )
      .pipe(schema as z.ZodType<string[], string[]>),
    default: (options.default ?? null) as D,
  })
}

/**
 * Reads settings from the environment. An empty variable counts as not set.
 * Returns every value found, and every problem, so they can all be shown at
 * once.
 */
export function readEnvironment(
  settings: readonly AnySetting[],
  env: Record<string, string | undefined>
): { values: Map<string, unknown>; problems: string[] } {
  const values = new Map<string, unknown>()
  const problems: string[] = []
  for (const setting of settings) {
    if (!setting.env) continue
    const raw = env[setting.env]
    if (raw === undefined || raw === "") continue
    const result = setting.fromEnv.safeParse(raw)
    if (result.success) {
      values.set(setting.key, result.data)
    } else {
      const issue = result.error.issues[0]
      problems.push(`  ${setting.env}: ${issue?.message ?? "Not valid"}`)
    }
  }
  return { values, problems }
}

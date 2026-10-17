import { expect, test } from "vitest"
import { BOOT_SETTINGS } from "../core/config.ts"
import { MODULES } from "./index.ts"
import { MODULE_SETTINGS } from "./settings.ts"

test("startup reads every module's settings", () => {
  // MODULE_SETTINGS is kept apart so startup can read it early: it must
  // match what the modules declare.
  expect(new Set(MODULE_SETTINGS)).toEqual(
    new Set(MODULES.flatMap((module) => module.settings))
  )
})

test("each setting has a key of its own, starting with its module", () => {
  const keys = MODULE_SETTINGS.map((setting) => setting.key)
  expect(new Set(keys).size).toBe(keys.length)

  for (const module of MODULES) {
    for (const setting of module.settings) {
      expect(setting.key.startsWith(`${module.id}.`), setting.key).toBe(true)
    }
  }
})

test("no two settings share an environment variable", () => {
  const names = [...Object.values(BOOT_SETTINGS), ...MODULE_SETTINGS].flatMap(
    (setting) => (setting.env ? [setting.env] : [])
  )
  expect(new Set(names).size).toBe(names.length)
  for (const name of names) {
    expect(name, name).toMatch(/^(MERRAN_[A-Z0-9_]+|PORT|DATABASE_URL)$/)
  }
})

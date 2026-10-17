import { describe, expect, test } from "vitest"
import { z } from "zod"
import {
  choiceSetting,
  listSetting,
  numberSetting,
  readEnvironment,
  secretSetting,
  switchSetting,
  textSetting,
} from "./settings.ts"

const SETTINGS = {
  name: textSetting({ key: "test.name", env: "TEST_NAME", description: "" }),
  count: numberSetting({
    key: "test.count",
    env: "TEST_COUNT",
    description: "",
    schema: z.number().int().min(1),
    default: 3,
  }),
  on: switchSetting({
    key: "test.on",
    env: "TEST_ON",
    description: "",
    default: false,
  }),
  size: choiceSetting({
    key: "test.size",
    env: "TEST_SIZE",
    description: "",
    choices: ["small", "large"],
  }),
  hosts: listSetting({
    key: "test.hosts",
    env: "TEST_HOSTS",
    description: "",
    item: z.string().min(2),
  }),
  key: secretSetting({ key: "test.key", env: "TEST_KEY", description: "" }),
}
const ALL = Object.values(SETTINGS)

describe("settings from the environment", () => {
  test("are read by their kind", () => {
    const { values, problems } = readEnvironment(ALL, {
      TEST_NAME: "Home",
      TEST_COUNT: "12",
      TEST_ON: "Yes",
      TEST_SIZE: "large",
      TEST_HOSTS: "one, two,,three ",
      TEST_KEY: "sk-test",
    })

    expect(problems).toEqual([])
    expect(Object.fromEntries(values)).toEqual({
      "test.name": "Home",
      "test.count": 12,
      "test.on": true,
      "test.size": "large",
      "test.hosts": ["one", "two", "three"],
      "test.key": "sk-test",
    })
  })

  test("switches take the usual words for yes and no", () => {
    for (const [raw, expected] of [
      ["true", true],
      ["on", true],
      ["1", true],
      ["off", false],
      ["no", false],
      ["FALSE", false],
    ] as const) {
      const { values } = readEnvironment([SETTINGS.on], { TEST_ON: raw })
      expect(values.get("test.on"), raw).toBe(expected)
    }
  })

  test("empty or missing ones are left out", () => {
    const { values } = readEnvironment(ALL, {
      TEST_NAME: "",
      TEST_COUNT: undefined,
    })

    expect(values.size).toBe(0)
  })

  test("every problem is listed, by variable", () => {
    const { problems } = readEnvironment(ALL, {
      TEST_COUNT: "lots",
      TEST_ON: "maybe",
      TEST_SIZE: "medium",
      TEST_HOSTS: "a, bb",
    })

    expect(problems).toEqual([
      "  TEST_COUNT: Use a number",
      "  TEST_ON: Use true or false (on and off work too)",
      "  TEST_SIZE: Use one of: small, large",
      expect.stringMatching(/^ {2}TEST_HOSTS: /),
    ])
  })
})

test("only server settings can come from the environment", () => {
  expect(() =>
    textSetting({
      key: "test.household",
      level: "household",
      env: "TEST_HOUSEHOLD",
      description: "",
    })
  ).toThrow(/only server settings/)
})

import { afterAll, beforeAll, expect, test } from "vitest"
import { Secret } from "../../database/entities/index.ts"
import type { Database } from "../../database/orm.ts"
import { createTestDatabase } from "../../test/database.ts"
import { rotateSecrets } from "./rotate.ts"
import { SecretBox } from "./secret-box.ts"

let database: Database
let close: () => Promise<void>

beforeAll(async () => {
  ;({ database, close } = await createTestDatabase())
})

afterAll(() => close())

test("rotating moves every secret to the new master key", async () => {
  const before = new SecretBox("the secret before, long enough to be used")
  const after = new SecretBox("the secret after, also long enough to use")
  const lost = new SecretBox("a secret from long ago, nobody has it now")

  const em = database.em.fork()
  em.create(Secret, before.seal("first key"))
  em.create(Secret, before.seal("second key"))
  em.create(Secret, lost.seal("a key nobody can read"))
  await em.flush()

  expect(await rotateSecrets(database.em.fork(), before, after)).toEqual({
    rotated: 2,
    alreadyDone: 0,
    unreadable: 1,
  })

  const secrets = await database.em.fork().find(Secret, {})
  const readable = secrets.filter((secret) => secret.keyId === after.keyId)
  expect(readable.map((secret) => after.open(secret)).sort()).toEqual([
    "first key",
    "second key",
  ])

  // Running it again, say after a crash, changes nothing.
  expect(await rotateSecrets(database.em.fork(), before, after)).toEqual({
    rotated: 0,
    alreadyDone: 2,
    unreadable: 1,
  })
})

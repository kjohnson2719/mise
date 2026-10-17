import { afterAll, beforeAll, describe, expect, test } from "vitest"
import {
  Household,
  HouseholdMember,
  Session,
  User,
} from "../../database/entities/index.ts"
import type { Database } from "../../database/orm.ts"
import { createTestDatabase, testDatabaseKind } from "../../test/database.ts"
import { createAuth, type Auth } from "./auth.ts"

let database: Database
let close: () => Promise<void>
let auth: Auth

beforeAll(async () => {
  ;({ database, close } = await createTestDatabase())
  auth = createAuth({
    config: {
      database: { kind: testDatabaseKind } as never,
      publicUrl: undefined,
    },
    database,
    secret: "a test secret that is long enough to use",
  })
})

afterAll(() => close())

const password = "correct horse battery"

async function makeUser(name: string, username: string) {
  const context = await auth.$context
  const user = await context.internalAdapter.createUser(
    {
      name,
      email: `${username}@example.com`,
      username,
      displayUsername: name,
    },
    { method: "admin" }
  )
  await context.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await context.password.hash(password),
  })
  return user
}

async function signIn(username: string) {
  const res = await auth.api.signInUsername({
    body: { username, password },
    asResponse: true,
  })
  expect(res.status).toBe(200)
  const cookie = res.headers.get("set-cookie") ?? ""
  return new Headers({ cookie: cookie.split(";")[0] ?? "" })
}

describe("Better Auth on MikroORM's tables", () => {
  test("a user Better Auth makes reads back through MikroORM", async () => {
    const made = await makeUser("Kyle", "kyle")

    const user = await database.em.fork().findOneOrFail(User, made.id)
    expect(user).toMatchObject({
      name: "Kyle",
      email: "kyle@example.com",
      username: "kyle",
      emailVerified: false,
      role: "user",
    })
    expect(user.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(user.createdAt).toBeInstanceOf(Date)
    expect(Math.abs(user.createdAt.getTime() - Date.now())).toBeLessThan(60_000)
  })

  test("signing in by username makes a session both can read", async () => {
    const headers = await signIn("kyle")

    const session = await auth.api.getSession({ headers })
    expect(session?.user.username).toBe("kyle")

    const stored = await database.em
      .fork()
      .findOneOrFail(Session, session!.session.id)
    expect(stored.expiresAt.getTime()).toBeGreaterThan(
      Date.now() + 80 * 24 * 60 * 60 * 1000
    )
  })

  test("households MikroORM makes are Better Auth's organizations", async () => {
    const user = await database.em
      .fork()
      .findOneOrFail(User, { username: "kyle" })
    const em = database.em.fork()
    const household = em.create(Household, { name: "Home", slug: "home" })
    em.create(HouseholdMember, { household, user, role: "owner" })
    await em.flush()

    const headers = await signIn("kyle")
    await auth.api.setActiveOrganization({
      body: { organizationId: household.id },
      headers,
    })

    const session = await auth.api.getSession({ headers })
    expect(session?.session.activeOrganizationId).toBe(household.id)
    const stored = await database.em
      .fork()
      .findOneOrFail(Session, session!.session.id)
    expect(stored.activeHousehold?.id).toBe(household.id)
  })

  test("a wrong password is refused", async () => {
    const res = await auth.api.signInUsername({
      body: { username: "kyle", password: "not the password" },
      asResponse: true,
    })
    expect(res.status).toBe(401)
  })
})

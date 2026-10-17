import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../../app.ts"
import { ApiKey } from "../../../../database/entities/index.ts"
import type { Database } from "../../../../database/orm.ts"
import { ACROSS_HOUSEHOLDS } from "../../../../database/scope.ts"
import {
  account,
  createTestApp,
  inviteToken,
  join,
  setUpServer,
  TEST_ORIGIN,
  TestClient,
} from "../../../../test/app.ts"

let app: App
let database: Database
let close: () => Promise<void>
let kyle: TestClient

beforeAll(async () => {
  const test = await createTestApp()
  ;({ app, database, close } = test)
  kyle = await setUpServer(app, test.setupCode)
})

afterAll(() => close())

/** Makes a key as `owner`; returns the key and what was said about it. */
async function makeKey(
  owner: TestClient,
  permissions: Record<string, string> = { household: "read" },
  expiresInDays: number | null = 90
) {
  const res = await owner.post("/api/auth/api-keys", {
    name: "Home Assistant",
    permissions,
    expiresInDays,
  })
  if (res.status !== 201) {
    throw new Error(`Making a key failed: ${res.status} ${await res.text()}`)
  }
  return res.json()
}

/** A request sent with an API key, like a script or Home Assistant would. */
function withKey(key: string, path: string, method = "GET", body?: unknown) {
  return app.request(`${TEST_ORIGIN}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${key}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}

describe("making an API key", () => {
  test("shows the key once, and only its start after", async () => {
    const made = await makeKey(kyle)

    expect(made.key).toMatch(/^mrn_[\w-]{40,}$/)
    expect(made.key.startsWith(made.start)).toBe(true)
    expect(made).toMatchObject({
      name: "Home Assistant",
      household: { name: "Home" },
      permissions: { household: "read" },
    })

    const listed = await (await kyle.get("/api/auth/api-keys")).json()
    const found = listed.find((key: { id: string }) => key.id === made.id)
    expect(found).toMatchObject({ start: made.start })
    expect(found).not.toHaveProperty("key")
  })

  test("only keeps a hash of the key", async () => {
    const made = await makeKey(kyle)
    const stored = await database.em
      .fork()
      .findOneOrFail(ApiKey, made.id, ACROSS_HOUSEHOLDS)

    expect(stored.keyHash).not.toContain(made.key)
    expect(stored.keyHash).toMatch(/^[0-9a-f]{64}$/)
  })

  test("refuses permissions that don't exist, and writing the household", async () => {
    for (const permissions of [{ household: "write" }, { garage: "read" }]) {
      const res = await kyle.post("/api/auth/api-keys", {
        name: "Bad",
        permissions,
      })
      expect(res.status, JSON.stringify(permissions)).toBe(400)
    }
  })
})

describe("using an API key", () => {
  test("it says which key it is", async () => {
    const made = await makeKey(kyle)
    const res = await withKey(made.key, "/api/auth/api-keys/current")

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: made.id, start: made.start })
  })

  test("it reads the household with household: read", async () => {
    const { key } = await makeKey(kyle)

    const household = await withKey(key, "/api/households/current")
    expect(household.status).toBe(200)
    expect(await household.json()).toMatchObject({ name: "Home" })

    const members = await withKey(key, "/api/households/current/members")
    expect(members.status).toBe(200)
  })

  test("it can't do what it wasn't given", async () => {
    const { key } = await makeKey(kyle, { recipes: "read" })
    const res = await withKey(key, "/api/households/current")

    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({
      error: { code: "missing_permission" },
    })
  })

  test("it never does admin things, even an owner's", async () => {
    const { key } = await makeKey(kyle)

    for (const [method, path, body] of [
      ["PATCH", "/api/households/current", { name: "Taken over" }],
      ["POST", "/api/households/current/invites", { role: "admin" }],
      ["POST", "/api/auth/api-keys", { name: "More", permissions: {} }],
      ["GET", "/api/auth/me", undefined],
    ] as const) {
      const res = await withKey(key, path, method, body)
      expect(res.status, `${method} ${path}`).toBe(403)
      expect(await res.json()).toMatchObject({
        error: { code: "api_key_not_allowed" },
      })
    }
  })

  test("it stays in its own household when its person switches", async () => {
    const { key } = await makeKey(kyle)
    await kyle.post("/api/households", { name: "Parents" })

    const res = await withKey(key, "/api/households/current")
    expect(await res.json()).toMatchObject({ name: "Home" })
  })

  test("can be made for another of its person's households", async () => {
    // Parents is in use now; the key is for Home.
    const me = await (await kyle.get("/api/auth/me")).json()
    const home = me.households.find(
      (household: { name: string }) => household.name === "Home"
    )
    const res = await kyle.post("/api/auth/api-keys", {
      name: "Browser extension",
      permissions: { household: "read" },
      household: home.id,
    })
    expect(res.status).toBe(201)
    const made = await res.json()
    expect(made.household).toEqual({ id: home.id, name: "Home" })
    const current = await withKey(made.key, "/api/households/current")
    expect(await current.json()).toMatchObject({ name: "Home" })

    // Not one they aren't in.
    const theirs = await kyle.post("/api/auth/api-keys", {
      name: "Sneaky",
      permissions: { household: "read" },
      household: "01a00000-0000-7000-8000-000000000000",
    })
    expect(theirs.status).toBe(404)
  })

  test("a made-up key, or another kind of token, is refused", async () => {
    for (const key of ["mrn_madeup", "eyJhbGciOiJIUzI1NiJ9.e30.x"]) {
      const res = await withKey(key, "/api/households/current")
      expect(res.status, key).toBe(401)
      expect(await res.json()).toMatchObject({
        error: { code: "invalid_api_key" },
      })
    }
  })

  test("without a key, the check says to send one", async () => {
    const res = await kyle.get("/api/auth/api-keys/current")

    expect(res.status).toBe(400)
  })
})

describe("a key stops working", () => {
  test("when it's revoked", async () => {
    const made = await makeKey(kyle)
    expect((await kyle.delete(`/api/auth/api-keys/${made.id}`)).status).toBe(
      204
    )

    expect((await withKey(made.key, "/api/auth/api-keys/current")).status).toBe(
      401
    )
  })

  test("when it expires", async () => {
    const made = await makeKey(kyle)
    await database.em
      .fork()
      .nativeUpdate(
        ApiKey,
        { id: made.id },
        { expiresAt: new Date(Date.now() - 1000) },
        ACROSS_HOUSEHOLDS
      )

    expect((await withKey(made.key, "/api/auth/api-keys/current")).status).toBe(
      401
    )
  })

  test("when its person leaves the household", async () => {
    await kyle.post("/api/auth/organization/set-active", {
      organizationId: (
        await (await kyle.get("/api/auth/me")).json()
      ).households.find((h: { name: string }) => h.name === "Home").id,
    })
    const sam = await join(app, await inviteToken(kyle), account("sam"))
    const { key } = await makeKey(sam)
    expect((await withKey(key, "/api/households/current")).status).toBe(200)

    const me = await (await sam.get("/api/households/current/members")).json()
    const samMember = me.find((m: { username: string }) => m.username === "sam")
    await sam.delete(`/api/households/current/members/${samMember.id}`)

    expect((await withKey(key, "/api/households/current")).status).toBe(401)
  })

  test("nobody else can revoke your keys", async () => {
    const made = await makeKey(kyle)
    const joey = await join(app, await inviteToken(kyle), account("joey"))

    expect((await joey.delete(`/api/auth/api-keys/${made.id}`)).status).toBe(
      404
    )
    expect((await withKey(made.key, "/api/auth/api-keys/current")).status).toBe(
      200
    )
  })
})

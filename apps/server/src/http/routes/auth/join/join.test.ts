import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../../app.ts"
import { InviteLink } from "../../../../database/entities/index.ts"
import type { Database } from "../../../../database/orm.ts"
import { ACROSS_HOUSEHOLDS } from "../../../../database/scope.ts"
import {
  account,
  createTestApp,
  inviteToken,
  join,
  setUpServer,
  TestClient,
} from "../../../../test/app.ts"

let app: App
let database: Database
let close: () => Promise<void>
let owner: TestClient

beforeAll(async () => {
  const test = await createTestApp()
  ;({ app, database, close } = test)
  owner = await setUpServer(app, test.setupCode)
})

afterAll(() => close())

describe("joining with an invite link", () => {
  test("shows which household it's for", async () => {
    const token = await inviteToken(owner)
    const res = await new TestClient(app).get(`/api/auth/join/${token}`)

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      household: { name: "Home" },
      role: "member",
    })
  })

  test("signed out, it needs an account", async () => {
    const token = await inviteToken(owner)
    const res = await new TestClient(app).post(`/api/auth/join/${token}`)

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({
      error: { code: "account_needed" },
    })
  })

  test("checks the new account like any other", async () => {
    const token = await inviteToken(owner)
    const res = await new TestClient(app).post(`/api/auth/join/${token}`, {
      account: { ...account("jo"), password: "short" },
    })

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({
      error: { fields: { "account.password": expect.any(String) } },
    })
  })

  test("makes the account, joins, and signs in", async () => {
    const token = await inviteToken(owner, "admin")
    const jamie = await join(app, token, account("jamie", "Jamie"))

    const me = await (await jamie.get("/api/auth/me")).json()
    expect(me).toMatchObject({
      name: "Jamie",
      serverAdmin: false,
      households: [{ name: "Home", role: "admin" }],
    })
  })

  test("works only once", async () => {
    const token = await inviteToken(owner)
    await join(app, token, account("sam"))

    const again = await new TestClient(app).post(`/api/auth/join/${token}`, {
      account: account("pat"),
    })
    expect(again.status).toBe(410)
  })

  test("doesn't work once it's expired", async () => {
    const token = await inviteToken(owner)
    await database.em
      .fork()
      .nativeUpdate(
        InviteLink,
        { usedAt: null },
        { expiresAt: new Date(Date.now() - 1000) },
        ACROSS_HOUSEHOLDS
      )

    const res = await new TestClient(app).get(`/api/auth/join/${token}`)
    expect(res.status).toBe(410)
  })

  test("doesn't work with a made-up link", async () => {
    const res = await new TestClient(app).get("/api/auth/join/not-a-real-token")

    expect(res.status).toBe(404)
  })

  test("signed in, it adds a second household and switches to it", async () => {
    const createRes = await owner.post("/api/households", { name: "Parents" })
    expect(createRes.status).toBe(201)
    const token = await inviteToken(owner)
    await owner.post("/api/auth/organization/set-active", {
      organizationId: (
        (await (await owner.get("/api/auth/me")).json()) as {
          households: { id: string; name: string }[]
        }
      ).households.find((h) => h.name === "Home")!.id,
    })

    const jamie = new TestClient(app)
    await jamie.post("/api/auth/sign-in/username", {
      username: "jamie",
      password: account("jamie").password,
    })
    const res = await jamie.post(`/api/auth/join/${token}`)
    expect(res.status).toBe(200)

    const me = await (await jamie.get("/api/auth/me")).json()
    const names = me.households.map((h: { name: string }) => h.name)
    expect(names).toEqual(["Home", "Parents"])
    const parents = me.households.find(
      (h: { name: string }) => h.name === "Parents"
    )
    expect(me.activeHouseholdId).toBe(parents.id)
  })
})

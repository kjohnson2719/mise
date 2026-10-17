import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../app.ts"
import type { SetupCode } from "../../../services/auth/setup-code.ts"
import {
  account,
  createTestApp,
  setUpServer,
  TEST_PASSWORD,
  TestClient,
} from "../../../test/app.ts"

let app: App
let setupCode: SetupCode
let close: () => Promise<void>

beforeAll(async () => {
  ;({ app, setupCode, close } = await createTestApp())
})

afterAll(() => close())

describe("setting up a fresh server", () => {
  test("says it needs setting up", async () => {
    const res = await new TestClient(app).get("/api/auth/setup")

    expect(await res.json()).toEqual({ needed: true })
  })

  test("refuses a wrong code", async () => {
    setupCode.issue()
    const res = await new TestClient(app).post("/api/auth/setup", {
      ...account("kyle", "Kyle"),
      code: "WRONG-CODE",
      household: "Home",
    })

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({
      error: { code: "wrong_setup_code", fields: { code: expect.any(String) } },
    })
  })

  test("makes the server admin and their household, signed in", async () => {
    const client = await setUpServer(app, setupCode)

    const me = await (await client.get("/api/auth/me")).json()
    expect(me).toMatchObject({
      name: "Kyle",
      username: "kyle",
      serverAdmin: true,
      households: [{ name: "Home", role: "owner" }],
    })
    expect(me.activeHouseholdId).toBe(me.households[0].id)
  })

  test("can only happen once", async () => {
    const status = await new TestClient(app).get("/api/auth/setup")
    expect(await status.json()).toEqual({ needed: false })

    const again = await new TestClient(app).post("/api/auth/setup", {
      ...account("someone"),
      code: setupCode.issue(),
      household: "Mine",
    })
    expect(again.status).toBe(409)
  })
})

describe("signing in", () => {
  test("works with a username or an email", async () => {
    for (const [path, body] of [
      ["/api/auth/sign-in/username", { username: "kyle" }],
      ["/api/auth/sign-in/email", { email: "kyle@example.com" }],
    ] as const) {
      const client = new TestClient(app)
      const res = await client.post(path, { ...body, password: TEST_PASSWORD })
      expect(res.status, path).toBe(200)

      const me = await client.get("/api/auth/me")
      expect(me.status, path).toBe(200)
    }
  })

  test("refuses a wrong password", async () => {
    const res = await new TestClient(app).post("/api/auth/sign-in/username", {
      username: "kyle",
      password: "not the password",
    })

    expect(res.status).toBe(401)
  })

  test("signing out ends the session", async () => {
    const client = new TestClient(app)
    await client.post("/api/auth/sign-in/username", {
      username: "kyle",
      password: TEST_PASSWORD,
    })
    await client.post("/api/auth/sign-out")

    expect((await client.get("/api/auth/me")).status).toBe(401)
  })

  test("nobody can sign themselves up", async () => {
    const res = await new TestClient(app).post("/api/auth/sign-up/email", {
      ...account("stranger"),
    })

    expect(res.ok).toBe(false)
  })

  test("signed out, /me says so in the standard shape", async () => {
    const res = await new TestClient(app).get("/api/auth/me")

    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: { code: "signed_out" } })
  })
})

describe("too many wrong setup codes", () => {
  test("lock setup for a while, even with the right code", async () => {
    const fresh = await createTestApp()
    try {
      const code = fresh.setupCode.issue()
      const client = new TestClient(fresh.app)
      const body = { ...account("kyle"), household: "Home" }
      for (let i = 0; i < 20; i++) {
        await client.post("/api/auth/setup", { ...body, code: "WRONG" })
      }

      const res = await client.post("/api/auth/setup", { ...body, code })
      expect(res.status).toBe(429)
    } finally {
      await fresh.close()
    }
  })
})

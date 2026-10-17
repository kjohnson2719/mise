import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../app.ts"
import {
  account,
  createTestApp,
  inviteToken,
  join,
  setUpServer,
  TestClient,
} from "../../../test/app.ts"

type Member = { id: string; name: string; role: string }

let app: App
let close: () => Promise<void>
let kyle: TestClient
let jamie: TestClient
let sam: TestClient

beforeAll(async () => {
  const test = await createTestApp()
  ;({ app, close } = test)
  kyle = await setUpServer(app, test.setupCode)
  jamie = await join(app, await inviteToken(kyle), account("jamie", "Jamie"))
  sam = await join(app, await inviteToken(kyle), account("sam", "Sam"))
})

afterAll(() => close())

async function members(client: TestClient): Promise<Member[]> {
  return (await client.get("/api/households/current/members")).json()
}

async function memberId(name: string) {
  return (await members(kyle)).find((member) => member.name === name)!.id
}

describe("the household in use", () => {
  test("is described with your role in it", async () => {
    const res = await jamie.get("/api/households/current")

    expect(await res.json()).toMatchObject({
      name: "Home",
      timeZone: "UTC",
      role: "member",
    })
  })

  test("can be changed by its admins only", async () => {
    const byMember = await jamie.patch("/api/households/current", {
      name: "Jamie's",
    })
    expect(byMember.status).toBe(403)

    const byOwner = await kyle.patch("/api/households/current", {
      name: "The Johnsons",
      timeZone: "America/Phoenix",
    })
    expect(byOwner.status).toBe(200)
    expect(await byOwner.json()).toMatchObject({
      name: "The Johnsons",
      timeZone: "America/Phoenix",
    })
  })

  test("refuses a time zone that doesn't exist", async () => {
    const res = await kyle.patch("/api/households/current", {
      timeZone: "Mars/Olympus",
    })

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({
      error: { fields: { timeZone: expect.any(String) } },
    })
  })

  test("needs a sign-in", async () => {
    const res = await new TestClient(app).get("/api/households/current")

    expect(res.status).toBe(401)
  })
})

describe("members", () => {
  test("everyone can see who's in the household", async () => {
    expect((await members(sam)).map((member) => member.name)).toEqual([
      "Kyle",
      "Jamie",
      "Sam",
    ])
  })

  test("an owner can make someone an admin", async () => {
    const res = await kyle.patch(
      `/api/households/current/members/${await memberId("Jamie")}`,
      { role: "admin" }
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ name: "Jamie", role: "admin" })
  })

  test("only an owner can make an owner", async () => {
    const res = await jamie.patch(
      `/api/households/current/members/${await memberId("Sam")}`,
      { role: "owner" }
    )

    expect(res.status).toBe(403)
  })

  test("the last owner can't step down or leave", async () => {
    const id = await memberId("Kyle")

    const stepDown = await kyle.patch(`/api/households/current/members/${id}`, {
      role: "member",
    })
    expect(stepDown.status).toBe(409)

    const leave = await kyle.delete(`/api/households/current/members/${id}`)
    expect(leave.status).toBe(409)
  })

  test("a member can't remove someone else", async () => {
    const res = await sam.delete(
      `/api/households/current/members/${await memberId("Jamie")}`
    )

    expect(res.status).toBe(403)
  })

  test("anyone can leave", async () => {
    const res = await sam.delete(
      `/api/households/current/members/${await memberId("Sam")}`
    )

    expect(res.status).toBe(204)
    expect((await members(kyle)).map((member) => member.name)).toEqual([
      "Kyle",
      "Jamie",
    ])
    expect((await sam.get("/api/households/current")).status).toBe(403)
  })
})

describe("invite links", () => {
  test("are listed for admins, without the link itself", async () => {
    await inviteToken(kyle)
    const res = await jamie.get("/api/households/current/invites")

    expect(res.status).toBe(200)
    const [first] = await res.json()
    expect(first).toMatchObject({ role: "member" })
    expect(first).not.toHaveProperty("link")
  })

  test("can be cancelled, and then don't work", async () => {
    const token = await inviteToken(kyle)
    const [newest] = await (
      await kyle.get("/api/households/current/invites")
    ).json()

    const res = await kyle.delete(
      `/api/households/current/invites/${newest.id}`
    )
    expect(res.status).toBe(204)
    expect(
      (await new TestClient(app).get(`/api/auth/join/${token}`)).status
    ).toBe(404)
  })

  test("can't be made by members", async () => {
    const token = await inviteToken(kyle)
    const pat = await join(app, token, account("pat"))

    const res = await pat.post("/api/households/current/invites", {
      role: "member",
    })
    expect(res.status).toBe(403)
  })
})

describe("more than one household", () => {
  test("only the server admin can start one, for now", async () => {
    expect((await jamie.post("/api/households", { name: "Mine" })).status).toBe(
      403
    )

    const res = await kyle.post("/api/households", { name: "Parents" })
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ name: "Parents", role: "owner" })
  })

  test("each household sees only its own people", async () => {
    expect((await members(kyle)).map((member) => member.name)).toEqual(["Kyle"])
    expect((await members(jamie)).map((member) => member.name)).toContain(
      "Jamie"
    )
  })

  test("switching households changes the one in use", async () => {
    const me = await (await kyle.get("/api/auth/me")).json()
    const home = me.households.find(
      (h: { name: string }) => h.name === "The Johnsons"
    )

    const res = await kyle.post("/api/auth/organization/set-active", {
      organizationId: home.id,
    })
    expect(res.status).toBe(200)
    expect(
      await (await kyle.get("/api/households/current")).json()
    ).toMatchObject({ name: "The Johnsons" })
  })

  test("you can't switch to a household you're not in", async () => {
    const me = await (await kyle.get("/api/auth/me")).json()
    const parents = me.households.find(
      (h: { name: string }) => h.name === "Parents"
    )

    const res = await jamie.post("/api/auth/organization/set-active", {
      organizationId: parents.id,
    })
    expect(res.ok).toBe(false)
    expect(
      await (await jamie.get("/api/households/current")).json()
    ).toMatchObject({ name: "The Johnsons" })
  })
})

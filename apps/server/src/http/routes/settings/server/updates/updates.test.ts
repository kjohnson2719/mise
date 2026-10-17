import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../../../app.ts"
import type { Fetcher } from "../../../../../services/fetch/public-fetch.ts"
import {
  account,
  createTestApp,
  inviteToken,
  join,
  setUpServer,
  TestClient,
} from "../../../../../test/app.ts"

// The update check, on a server running 0.1.0-alpha.1: GitHub's releases,
// from a stand-in, never the real thing.

let app: App
let close: () => Promise<void>
let kyle: TestClient
let jamie: TestClient
const asked: string[] = []

const release = (tag: string) => ({
  tag_name: tag,
  name: null,
  html_url: `https://github.com/merran-app/merran/releases/tag/${tag}`,
  body: "## What's new\n\n- Send splits the list across your stores.",
  published_at: "2026-10-20T16:00:00Z",
  draft: false,
  prerelease: true,
})

const fetcher: Fetcher = async (url) => {
  asked.push(url)
  return {
    url,
    status: 200,
    contentType: "application/json",
    body: Buffer.from(
      JSON.stringify([release("v0.1.0-alpha.2"), release("v0.1.0-alpha.1")])
    ),
  }
}

beforeAll(async () => {
  const test = await createTestApp({
    env: { MERRAN_VERSION: "0.1.0-alpha.1" },
    fetcher,
  })
  ;({ app, close } = test)
  kyle = await setUpServer(app, test.setupCode)
  jamie = await join(app, await inviteToken(kyle), account("jamie", "Jamie"))
})

afterAll(() => close())

describe("the update check", () => {
  test("has nothing to say before it's looked", async () => {
    const res = await kyle.get("/api/settings/server/updates")
    expect(res.status, await res.clone().text()).toBe(200)
    expect(await res.json()).toEqual({
      current: "0.1.0-alpha.1",
      devBuild: false,
      checking: true,
      checkedAt: null,
      error: null,
      latest: null,
      newer: false,
      installMethod: "source",
    })
  })

  test("finds a newer release on GitHub, with its notes", async () => {
    const res = await kyle.post("/api/settings/server/updates/check", {})
    expect(res.status, await res.clone().text()).toBe(200)
    expect(asked).toEqual([
      "https://api.github.com/repos/merran-app/merran/releases?per_page=30",
    ])
    expect(await res.json()).toMatchObject({
      newer: true,
      latest: {
        version: "0.1.0-alpha.2",
        name: "Merran 0.1.0-alpha.2",
        url: "https://github.com/merran-app/merran/releases/tag/v0.1.0-alpha.2",
        notes: expect.stringContaining("Send splits the list"),
        prerelease: true,
      },
      error: null,
    })
    // Kept for the badge.
    const kept = await (await kyle.get("/api/settings/server/updates")).json()
    expect(kept).toMatchObject({ newer: true, checkedAt: expect.any(String) })
  })

  test("is for server admins", async () => {
    expect((await jamie.get("/api/settings/server/updates")).status).toBe(403)
    expect(
      (await jamie.post("/api/settings/server/updates/check", {})).status
    ).toBe(403)
  })

  test("doesn't look once it's turned off", async () => {
    const off = await kyle.patch("/api/settings/server", {
      "updates.check": false,
    })
    expect(off.status, await off.clone().text()).toBe(200)
    asked.length = 0
    const res = await kyle.post("/api/settings/server/updates/check", {})
    expect(asked).toEqual([])
    expect(await res.json()).toMatchObject({ checking: false })
  })
})

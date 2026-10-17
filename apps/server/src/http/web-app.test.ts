import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pino } from "pino"
import { afterAll, describe, expect, it } from "vitest"
import { handleNotFound } from "./errors.ts"
import { createRouter } from "./router.ts"
import { serveWebApp } from "./web-app.ts"

const logger = pino({ level: "silent" })
const dir = mkdtempSync(join(tmpdir(), "merran-web-"))
mkdirSync(join(dir, "assets"))
writeFileSync(join(dir, "index.html"), "<!doctype html><title>Merran</title>")
writeFileSync(join(dir, "assets", "app-1a2b.js"), "console.log('hi')")
writeFileSync(join(dir, "favicon.svg"), "<svg/>")

afterAll(() => rmSync(dir, { recursive: true, force: true }))

function createApp(webDir: string) {
  const app = createRouter()
  app.get("/api/health", (c) => c.json({ ok: true }))
  serveWebApp(app, webDir, logger)
  app.notFound(handleNotFound)
  return app
}

describe("the web app", () => {
  const app = createApp(dir)

  it("serves the page for any path the app's router handles", async () => {
    for (const path of ["/", "/recipes", "/settings/you", "/join/abc"]) {
      const res = await app.request(path)
      expect(res.status, path).toBe(200)
      expect(res.headers.get("content-type")).toContain("text/html")
      expect(res.headers.get("cache-control")).toBe("no-cache")
      expect(await res.text()).toContain("<title>Merran</title>")
    }
  })

  it("serves built files, caching assets for good", async () => {
    const asset = await app.request("/assets/app-1a2b.js")
    expect(asset.status).toBe(200)
    expect(asset.headers.get("cache-control")).toContain("immutable")
    expect(await asset.text()).toBe("console.log('hi')")

    const icon = await app.request("/favicon.svg")
    expect(icon.status).toBe(200)
    expect(icon.headers.get("cache-control")).toBeNull()
  })

  it("leaves the API alone", async () => {
    expect(await (await app.request("/api/health")).json()).toEqual({
      ok: true,
    })
    const missing = await app.request("/api/nothing-here")
    expect(missing.status).toBe(404)
    expect(await missing.json()).toMatchObject({
      error: { code: "not_found" },
    })
  })

  it("gives a 404 for a missing asset, not the page", async () => {
    const res = await app.request("/assets/gone.js")
    expect(res.status).toBe(404)
    expect(res.headers.get("content-type")).toContain("application/json")
  })

  it("takes a share without the service worker on to the share page", async () => {
    const shareForm = (fields: Record<string, string | File>) => {
      const form = new FormData()
      for (const [key, value] of Object.entries(fields)) form.append(key, value)
      return app.request("/share", { method: "POST", body: form })
    }

    const text = await shareForm({
      title: "Lemon Chicken",
      text: " https://example.com/lemon-chicken ",
      file: new File([], ""),
    })
    expect(text.status).toBe(303)
    const to = new URL(text.headers.get("location")!, "http://merran.test")
    expect(to.pathname).toBe("/share")
    expect(Object.fromEntries(to.searchParams)).toEqual({
      title: "Lemon Chicken",
      text: "https://example.com/lemon-chicken",
    })

    // Its photos can't be kept: the page says so.
    const photo = await shareForm({
      file: new File([new Uint8Array([0xff, 0xd8, 0xff])], "receipt.jpg", {
        type: "image/jpeg",
      }),
    })
    expect(photo.status).toBe(303)
    expect(photo.headers.get("location")).toBe("/share?lost=1")
  })

  it("doesn't escape its folder", async () => {
    const res = await app.request("/..%2f..%2fetc/passwd")
    expect(await res.text()).not.toContain("root:")
  })
})

describe("without a built web app", () => {
  it("serves only the API", async () => {
    const app = createApp(join(dir, "not-built"))
    expect((await app.request("/api/health")).status).toBe(200)
    expect((await app.request("/")).status).toBe(404)
  })
})

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { serveStatic } from "@hono/node-server/serve-static"
import { bodyLimit } from "hono/body-limit"
import type { Logger } from "pino"
import type { Router } from "./router.ts"

/** Vite names these after their contents, so a file there never changes. */
const ASSETS = "/assets/"

/** A share's photos, past which its text is let go too. */
const MAX_SHARE_BYTES = 25_000_000

function isApi(path: string) {
  return path === "/api" || path.startsWith("/api/")
}

/**
 * Serves the built web app: its files, and its index.html for every other
 * page, so the app's own router can show it. Does nothing when the app
 * hasn't been built, as in development, where Vite serves it instead.
 */
export function serveWebApp(app: Router, dir: string, logger: Logger) {
  const indexFile = join(dir, "index.html")
  if (!existsSync(indexFile)) {
    logger.info(`No web app built at ${dir}, so serving only the API`)
    return
  }
  const index = readFileSync(indexFile, "utf8")
  const files = serveStatic({ root: dir })

  app.use("*", async (c, next) => {
    const path = c.req.path
    if (isApi(path) || path === "/" || path === "/index.html") return next()
    if (path.startsWith(ASSETS)) {
      c.header("Cache-Control", "public, max-age=31536000, immutable")
    }
    return files(c, next)
  })

  // Android's share sheet posts to /share, for the web app's service worker
  // to keep its photos and PDFs (public/sw.js). Without one, as when its
  // site data was cleared, the text and link still go on to the share page,
  // which says the files didn't.
  app.post(
    "/share",
    bodyLimit({
      maxSize: MAX_SHARE_BYTES,
      onError: (c) => c.redirect("/share?lost=1", 303),
    }),
    async (c) => {
      const body: Record<string, unknown> = await c.req
        .parseBody({ all: true })
        .catch(() => ({}))
      const search = new URLSearchParams()
      for (const key of ["title", "text", "url"] as const) {
        const value = body[key]
        if (typeof value === "string" && value.trim()) {
          search.set(key, value.trim())
        }
      }
      const files = [body.file].flat()
      if (files.some((file) => file instanceof File && file.size > 0)) {
        search.set("lost", "1")
      }
      return c.redirect(`/share?${search}`, 303)
    }
  )

  app.get("*", (c) => {
    const path = c.req.path
    // A missing script or API route is a real 404, not a page.
    if (isApi(path) || path.startsWith(ASSETS)) return c.notFound()
    // Always check for a new version, so an update shows on the next load.
    c.header("Cache-Control", "no-cache")
    return c.html(index)
  })
}

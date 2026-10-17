// Merran's service worker. It does one thing: when Merran, installed on an
// Android home screen, is picked in the share sheet, it keeps the photos,
// screenshots or PDFs that were shared and opens the share page, which sends
// them on (features/share/shared-files.ts). Every other request goes to the
// network as it would without it. Browsers only run it over https, or on
// this computer.

/** Each share's files wait in a cache of their own, named for when it came. */
const SHARE_CACHE = "merran-share-"

/** A share the page never picked up is forgotten after a day. */
const KEEP_FOR = 24 * 60 * 60 * 1000

self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim())
)

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url)
  if (
    event.request.method === "POST" &&
    url.origin === self.location.origin &&
    url.pathname === "/share"
  ) {
    event.respondWith(receiveShare(event.request))
  }
})

const asText = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : null

async function receiveShare(request) {
  let form
  try {
    form = await request.formData()
  } catch {
    return Response.redirect("/share", 303)
  }
  const shared = {}
  for (const key of ["title", "text", "url"]) {
    const value = asText(form.get(key))
    if (value) shared[key] = value
  }
  const files = form
    .getAll("file")
    .filter((file) => file instanceof File && file.size > 0)

  // Text and links: in the share page's address, as before there were files.
  if (files.length === 0) {
    return Response.redirect(`/share?${new URLSearchParams(shared)}`, 303)
  }

  await forgetOld()
  const id = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
  const cache = await caches.open(SHARE_CACHE + id)
  await Promise.all(
    files.map((file, index) =>
      cache.put(
        `/shared/${index}`,
        new Response(file, {
          headers: {
            "content-type": file.type || "application/octet-stream",
            "x-file-name": encodeURIComponent(
              file.name || `shared-${index + 1}`
            ),
          },
        })
      )
    )
  )
  await cache.put(
    "/shared/about",
    new Response(JSON.stringify({ ...shared, files: files.length }), {
      headers: { "content-type": "application/json" },
    })
  )
  return Response.redirect(`/share?id=${id}`, 303)
}

/** Clears out shares from more than a day ago that were never sent on. */
async function forgetOld() {
  for (const name of await caches.keys()) {
    if (!name.startsWith(SHARE_CACHE)) continue
    const at = Number(name.slice(SHARE_CACHE.length).split("-")[0])
    if (!(Date.now() - at < KEEP_FOR)) await caches.delete(name)
  }
}

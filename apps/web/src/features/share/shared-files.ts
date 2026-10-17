// Files shared to Merran from Android's share sheet. The share target posts
// them, and the service worker (public/sw.js) keeps them in Cache Storage
// for the share page, under an id it gives it in the address.

/** Each share's cache is named this and its id, as the service worker does. */
const SHARE_CACHE = "merran-share-"

/** A share the service worker kept: its files, and any text or link with them. */
export type KeptShare = {
  title?: string
  text?: string
  url?: string
  files: File[]
}

/** What was shared, by the id the service worker gave it; null if it's gone. */
export async function readShared(id: string): Promise<KeptShare | null> {
  const name = SHARE_CACHE + id
  try {
    if (typeof caches === "undefined" || !(await caches.has(name))) return null
    const cache = await caches.open(name)
    const about = await cache.match("/shared/about")
    if (!about) return null
    const { files: count, ...text } = (await about.json()) as Omit<
      KeptShare,
      "files"
    > & { files: number }
    const files: File[] = []
    for (let index = 0; index < count; index++) {
      const res = await cache.match(`/shared/${index}`)
      if (!res) continue
      const blob = await res.blob()
      const fileName = decodeURIComponent(
        res.headers.get("x-file-name") ?? `shared-${index + 1}`
      )
      files.push(new File([blob], fileName, { type: blob.type }))
    }
    return { ...text, files }
  } catch {
    return null
  }
}

/** Forgets a share once it's been sent on. */
export async function forgetShared(id: string) {
  try {
    await caches.delete(SHARE_CACHE + id)
  } catch {
    // The service worker clears it out after a day.
  }
}

/**
 * Registers the service worker, which lets Android share photos and PDFs to
 * Merran. Browsers only have it over https, or on this computer.
 */
export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      // Sharing text and links still works, through the share page's address.
    })
  })
}

/**
 * Functions run inside a web page with scripting.executeScript. Each is
 * sent on its own, so it can't use anything from outside itself.
 */

/** What the extension reads from a page to import it. */
export type PageRead = {
  url: string
  title: string
  jsonld: string[]
  images: string[]
  text: string
  /** The page has a recipe in its data. */
  hasRecipe: boolean
}

/** Reads the open page as the browser shows it: its recipe data, photos and text. */
export function readPage(): PageRead {
  const blocks = Array.from(
    document.querySelectorAll('script[type="application/ld+json"]')
  )
    .map((script) => script.textContent ?? "")
    .filter((text) => text.trim())
  const isRecipe = (text: string) =>
    /"@type"\s*:\s*(\[[^\]]*)?"Recipe"/.test(text)
  // Kept small: a page can carry a lot of other data.
  let jsonld = blocks.slice(0, 20).map((text) => text.slice(0, 400_000))
  if (jsonld.reduce((sum, text) => sum + text.length, 0) > 600_000) {
    jsonld = jsonld.filter(isRecipe)
  }
  const meta = (selector: string) =>
    document.querySelector<HTMLMetaElement>(selector)?.content?.trim() ?? ""
  const images = [
    meta('meta[property="og:image"]'),
    meta('meta[name="twitter:image"]'),
  ].filter(Boolean)
  const root =
    document.querySelector("main") ??
    document.querySelector("article") ??
    document.body
  return {
    url: location.href,
    title: document.title,
    jsonld,
    images,
    text: (root?.innerText ?? "").slice(0, 80_000),
    hasRecipe: blocks.some(isRecipe),
  }
}

/** A small note in the corner of the page, for the right-click actions. */
export function showNote(
  message: string,
  link: string | null,
  isError: boolean
) {
  const id = "merran-extension-note"
  document.getElementById(id)?.remove()
  const note = document.createElement("div")
  note.id = id
  note.setAttribute("role", "status")
  Object.assign(note.style, {
    position: "fixed",
    right: "20px",
    bottom: "20px",
    zIndex: "2147483647",
    maxWidth: "340px",
    padding: "12px 16px",
    borderRadius: "16px",
    background: isError ? "#8f2a1c" : "#356844",
    color: "#fdfaf4",
    font: "500 14px/1.4 system-ui, sans-serif",
    boxShadow: "0 8px 30px rgba(0,0,0,.25)",
  })
  note.textContent = message
  if (link) {
    const a = document.createElement("a")
    a.href = link
    a.target = "_blank"
    a.rel = "noreferrer"
    a.textContent = " Open in Merran"
    Object.assign(a.style, { color: "#fdfaf4", textDecoration: "underline" })
    note.append(a)
  }
  document.body.append(note)
  setTimeout(() => note.remove(), 6000)
}

/**
 * On Merran's own "Connect the extension" page, opened by the extension:
 * takes the key the page offers, hands it to the extension, and tells the
 * page it arrived. Only ever run on that page.
 */
export function listenForKey(origin: string) {
  const flag = "__merranExtensionListening"
  const holder = window as unknown as Record<string, boolean>
  if (holder[flag]) return
  holder[flag] = true
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== origin) return
    const data = event.data as {
      source?: string
      type?: string
      key?: string
      keyId?: string
    }
    if (data?.source !== "merran") return
    // The page asking whether the extension's here, as it may have loaded
    // after this did.
    if (data.type === "extension-hello") {
      window.postMessage({ source: "merran-extension", type: "ready" }, origin)
      return
    }
    if (data.type !== "extension-key") return
    if (typeof data.key !== "string" || typeof data.keyId !== "string") return
    // `chrome` is there in every browser's pages, Firefox's included.
    const { chrome } = globalThis as unknown as { chrome: typeof browser }
    void chrome.runtime.sendMessage({
      type: "connect-key",
      origin,
      key: data.key,
      keyId: data.keyId,
    })
    window.postMessage(
      { source: "merran-extension", type: "key-received" },
      origin
    )
  })
  // Say the extension is here, so the page offers to connect.
  window.postMessage({ source: "merran-extension", type: "ready" }, origin)
}

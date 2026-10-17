import { getConnections } from "./merran"

// Keeps the bridge (entrypoints/merran.content.ts) on the pages of each
// Merran the extension is connected to, and nowhere else: registered with
// the browser for those addresses, and put on their open tabs as they
// connect, so a Merran page already open hears from the extension at once.

const BRIDGE = "merran-bridge"
const FILE = "/content-scripts/merran.js"

let queue: Promise<unknown> = Promise.resolve()

/** Brings the bridge in line with the connections, one change at a time. */
export function syncBridge(options: { inject: boolean }) {
  queue = queue.then(() => sync(options)).catch(() => {})
  return queue
}

async function sync({ inject }: { inject: boolean }) {
  const { all } = await getConnections()
  const origins = [...new Set(all.map((one) => one.origin))]
  // Only where the person let the extension reach, as they connected.
  const reach = await Promise.all(
    origins.map((origin) =>
      browser.permissions.contains({ origins: [`${origin}/*`] })
    )
  )
  const matches = origins
    .filter((_, i) => reach[i])
    .map((origin) => `${origin}/*`)
  const [now] = await browser.scripting.getRegisteredContentScripts({
    ids: [BRIDGE],
  })
  const same =
    now &&
    [...(now.matches ?? [])].sort().join(" ") === [...matches].sort().join(" ")
  if (!same) {
    if (now) await browser.scripting.unregisterContentScripts({ ids: [BRIDGE] })
    if (matches.length > 0) {
      await browser.scripting.registerContentScripts([
        { id: BRIDGE, matches, js: [FILE], runAt: "document_idle" },
      ])
    }
  }
  if (!inject || matches.length === 0) return
  const tabs = await browser.tabs.query({ url: matches })
  await Promise.all(
    tabs.map((tab) =>
      tab.id === undefined
        ? null
        : browser.scripting
            .executeScript({ target: { tabId: tab.id }, files: [FILE] })
            .catch(() => {})
    )
  )
}

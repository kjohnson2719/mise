import {
  addToList,
  importedMessage,
  importLink,
  importRead,
  isVideoPage,
  readTab,
  type Added,
} from "@/lib/actions"
import { syncBridge } from "@/lib/bridge"
import { addConnection, apiFor, unwrap } from "@/lib/merran"
import { listenForKey, showNote } from "@/lib/page"
import { answerPage, watchWalmart } from "@/lib/walmart"

// The extension's background: the right-click menu, connecting to a
// Merran, and what Merran's own pages ask through the bridge, such as
// filling the Walmart cart. Browsers stop it when it's idle, so what it
// waits for is kept in storage.

/** Connect pages the extension opened, by tab, waiting for their key. */
const connecting = {
  async get(tabId: number) {
    const key = `connecting:${tabId}`
    return (
      ((await browser.storage.session.get(key))[key] as string | undefined) ??
      null
    )
  },
  set: (tabId: number, origin: string) =>
    browser.storage.session.set({ [`connecting:${tabId}`]: origin }),
  delete: (tabId: number) =>
    browser.storage.session.remove(`connecting:${tabId}`),
}

/** Says how something went in the corner of the page. */
async function note(
  tabId: number | undefined,
  message: string,
  link: string | null = null,
  isError = false
) {
  if (tabId === undefined) return
  try {
    await browser.scripting.executeScript({
      target: { tabId },
      func: showNote,
      args: [message, link, isError],
    })
  } catch {
    // The browser's own pages can't show it; nothing to do.
  }
}

/**
 * Adds the recipe on the page in a tab, here rather than in the popup so
 * it carries on when the popup closes (a video takes a minute or two), and
 * says how it went on the page.
 */
async function addTab(tabId: number): Promise<Added> {
  try {
    const page = await readTab(tabId)
    await note(
      tabId,
      isVideoPage(page.url)
        ? "Watching the video for its recipe. It takes a minute or two."
        : "Adding this recipe…"
    )
    const { result, link } = await importRead(page)
    const message = importedMessage(result)
    await note(tabId, message, link)
    return { ok: true, message, link }
  } catch (error) {
    const message = (error as Error).message
    await note(tabId, message, null, true)
    return { ok: false, message }
  }
}

/** Checks a key Merran handed over works, then keeps it. */
async function connect(origin: string, key: string, keyId: string) {
  const current = await unwrap(
    apiFor({ origin, token: key }).GET("/api/auth/api-keys/current"),
    origin
  )
  if (current.id !== keyId) return
  await addConnection({
    origin,
    token: key,
    keyId,
    householdId: current.household.id,
    household: current.household.name,
  })
}

export default defineBackground(() => {
  // The bridge on each connected Merran's pages: registered again each
  // time the background starts, and put on open tabs when that changes.
  void syncBridge({ inject: false })
  browser.storage.local.onChanged.addListener((changes) => {
    if ("connections" in changes) void syncBridge({ inject: true })
  })
  watchWalmart()

  browser.runtime.onInstalled.addListener(() => {
    void syncBridge({ inject: true })
    void browser.contextMenus.removeAll().then(() => {
      browser.contextMenus.create({
        id: "import-page",
        title: "Add this recipe to Merran",
        contexts: ["page"],
      })
      browser.contextMenus.create({
        id: "import-link",
        title: "Add the recipe at this link to Merran",
        contexts: ["link"],
      })
      browser.contextMenus.create({
        id: "add-to-list",
        title: "Add “%s” to the Merran shopping list",
        contexts: ["selection"],
      })
    })
  })

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    const tabId = tab?.id
    try {
      if (info.menuItemId === "import-page" && tabId !== undefined) {
        await addTab(tabId)
      } else if (info.menuItemId === "import-link" && info.linkUrl) {
        await note(tabId, "Adding the recipe at that link…")
        const { result, link } = await importLink(info.linkUrl)
        await note(tabId, importedMessage(result), link)
      } else if (info.menuItemId === "add-to-list" && info.selectionText) {
        const lines = await addToList(info.selectionText)
        await note(
          tabId,
          lines.length === 1
            ? `Added ${lines[0]} to the shopping list.`
            : `Added ${lines.length} things to the shopping list.`
        )
      }
    } catch (error) {
      await note(tabId, (error as Error).message, null, true)
    }
  })

  browser.runtime.onMessage.addListener((message, sender, respond) => {
    // From a Merran page, through the bridge: for the Merran the browser
    // says the page is on, which the background checks is connected.
    if (message?.type === "bridge" && typeof message.command === "string") {
      const tab = sender.tab
      if (sender.id !== browser.runtime.id || !tab || !sender.url) return
      const origin = new URL(sender.url).origin
      void answerPage(
        message.command,
        message.args ?? {},
        origin,
        tab.id === undefined
          ? null
          : { windowId: tab.windowId, index: tab.index },
        tab.id ?? null
      ).then(respond, () => respond({ ok: false, why: "failed" }))
      return true
    }
    // From the popup: add the recipe on the page in a tab.
    if (message?.type === "add-tab" && typeof message.tabId === "number") {
      void addTab(message.tabId).then(respond)
      // It answers when it's done.
      return true
    }
    // From the popup: open Merran's connect page, and wait there for a key.
    if (message?.type === "connect" && typeof message.origin === "string") {
      const origin = message.origin as string
      void browser.tabs
        .create({ url: `${origin}/extension/connect` })
        .then((tab) => {
          if (tab.id !== undefined) void connecting.set(tab.id, origin)
        })
      return
    }
    // From that page: the key Merran made for the extension.
    if (message?.type === "connect-key") {
      const tabId = sender.tab?.id
      if (tabId === undefined) return
      void (async () => {
        const origin = await connecting.get(tabId)
        if (!origin || origin !== message.origin) return
        await connecting.delete(tabId)
        await connect(origin, String(message.key), String(message.keyId))
      })().catch(() => {})
    }
  })

  // Once a connect page has loaded, listen on it for the key.
  browser.tabs.onUpdated.addListener((tabId, change, tab) => {
    if (change.status !== "complete") return
    void (async () => {
      const origin = await connecting.get(tabId)
      if (!origin || !tab.url?.startsWith(`${origin}/extension/connect`)) {
        return
      }
      await browser.scripting.executeScript({
        target: { tabId },
        func: listenForKey,
        args: [origin],
      })
    })().catch(() => {})
  })

  browser.tabs.onRemoved.addListener((tabId) => void connecting.delete(tabId))
})

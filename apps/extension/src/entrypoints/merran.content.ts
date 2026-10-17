import type {
  ExtensionCall,
  ExtensionMessage,
  ExtensionStatus,
} from "@merran/shared"

// The bridge, on the pages of each Merran the extension is connected to
// (registered for each as it connects, lib/bridge.ts): says the extension
// is here, hands what the page asks to the background, and tells the page
// when something it shows changes, such as a Walmart job moving on. It only
// ever passes messages; the background checks every call is from a
// connected Merran, by the page's address as the browser says it.

export default defineContentScript({
  registration: "runtime",
  main(ctx) {
    const origin = location.origin
    const post = (message: ExtensionMessage) =>
      window.postMessage(message, origin)

    ctx.addEventListener(window, "message", (event) => {
      // An old copy, from before the extension was reloaded, stays quiet.
      if (ctx.isInvalid) return
      if (event.source !== window || event.origin !== origin) return
      const call = event.data as Partial<ExtensionCall> | null
      if (call?.source !== "merran" || call.type !== "extension-call") return
      const { id, command, args } = call
      if (typeof id !== "string" || typeof command !== "string") return
      void browser.runtime
        .sendMessage({ type: "bridge", command, args: args ?? {} })
        .then((answer: unknown) =>
          post({
            source: "merran-extension",
            type: "extension-answer",
            id,
            answer,
          })
        )
        .catch(() => {
          // The extension was updated or turned off: this page needs a reload.
        })
    })

    const changed = (changes: Record<string, unknown>) => {
      if (ctx.isInvalid) return
      if (
        !("walmartJob" in changes) &&
        !("connections" in changes) &&
        !("bridgeChanged" in changes)
      ) {
        return
      }
      void browser.runtime
        .sendMessage({ type: "bridge", command: "status", args: {} })
        .then((status: ExtensionStatus) =>
          post({ source: "merran-extension", type: "extension-status", status })
        )
        .catch(() => {})
    }
    browser.storage.local.onChanged.addListener(changed)
    ctx.onInvalidated(() => {
      try {
        browser.storage.local.onChanged.removeListener(changed)
      } catch {
        // The extension was reloaded: its listeners went with it.
      }
    })

    post({ source: "merran-extension", type: "extension-here" })
  },
})

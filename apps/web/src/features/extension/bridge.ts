import type {
  ExtensionCalls,
  ExtensionCommand,
  ExtensionMessage,
  ExtensionStatus,
} from "@merran/shared"
import * as React from "react"

// Talking to Merran's browser extension from this page, when it's installed
// and connected to this Merran: it listens on the page (its bridge), says
// it's here, answers what the page asks, and says when something changes.
// See packages/shared/src/extension/bridge.ts for the messages.

/**
 * Looking for the extension; not heard from (not installed, not connected
 * to this Merran, or turned off); or here, with what it says about itself.
 */
export type Extension =
  | { state: "looking" }
  | { state: "missing" }
  | { state: "here"; status: ExtensionStatus }

/** How long to look before saying it isn't here. */
const LOOK_MS = 2500
/** How often to ask again while it isn't, so it shows up once it's set up. */
const AGAIN_MS = 2000

/** The extension didn't do something, with why, to show as it is. */
export class ExtensionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ExtensionError"
  }
}

let extension: Extension = { state: "looking" }
const listeners = new Set<() => void>()
const waiting = new Map<string, (answer: unknown) => void>()
let calls = 0

function set(next: Extension) {
  extension = next
  for (const listener of listeners) listener()
}

function heard(event: MessageEvent) {
  if (event.source !== window || event.origin !== location.origin) return
  const message = event.data as ExtensionMessage | null
  if (message?.source !== "merran-extension") return
  if (message.type === "extension-here") void ask()
  if (message.type === "extension-status") {
    set({ state: "here", status: message.status })
  }
  if (message.type === "extension-answer") {
    waiting.get(message.id)?.(message.answer)
    waiting.delete(message.id)
  }
}

/**
 * Asks the extension something, for its answer; null if it doesn't answer
 * in time (it isn't here, or was turned off).
 */
export function callExtension<C extends ExtensionCommand>(
  command: C,
  args: ExtensionCalls[C]["args"],
  waitMs = 5000
): Promise<ExtensionCalls[C]["answer"] | null> {
  // Not crypto.randomUUID: a Merran on plain http by a home network name
  // isn't a secure page, and doesn't have it.
  const id = `${Date.now().toString(36)}-${(calls++).toString(36)}-${Math.random().toString(36).slice(2)}`
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      waiting.delete(id)
      resolve(null)
    }, waitMs)
    waiting.set(id, (answer) => {
      clearTimeout(timer)
      resolve(answer as ExtensionCalls[C]["answer"])
    })
    window.postMessage(
      { source: "merran", type: "extension-call", id, command, args },
      location.origin
    )
  })
}

/** Asks how the extension is, and keeps the answer. */
async function ask() {
  const status = await callExtension("status", {}, 1500)
  if (status) set({ state: "here", status })
  return status
}

let looking: ReturnType<typeof setInterval> | null = null

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (listeners.size === 1) {
    window.addEventListener("message", heard)
    void ask()
    const started = Date.now()
    // Until it answers: then it says itself when something changes.
    looking = setInterval(() => {
      if (extension.state === "here") return
      if (extension.state === "looking" && Date.now() - started > LOOK_MS) {
        set({ state: "missing" })
      }
      void ask()
    }, AGAIN_MS / 2)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size > 0) return
    window.removeEventListener("message", heard)
    if (looking) clearInterval(looking)
    looking = null
    extension = { state: "looking" }
  }
}

/** The extension, as this page hears from it; looked for while it's shown. */
export function useExtension(): Extension {
  return React.useSyncExternalStore(subscribe, () => extension)
}

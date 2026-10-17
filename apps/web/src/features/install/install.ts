import * as React from "react"

// Putting Merran on the home screen. Chrome and Edge offer their own
// install prompt, which has to be caught as the page loads; Safari has
// none, so its people get a short guide instead.

/** Chrome's and Edge's install prompt, held for when someone asks. */
type InstallPrompt = Event & {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

/**
 * How this device can install Merran: it has already, the browser's own
 * prompt, the steps on an iPhone or iPad or in Safari on a Mac, or the
 * browser's menu.
 */
export type InstallWay = "installed" | "prompt" | "ios" | "mac" | "menu"

let prompt: InstallPrompt | null = null
let installedNow = false
let guideOpen = false
let version = 0
const listeners = new Set<() => void>()

function changed() {
  version++
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Opened from the home screen, or installed as an app on a computer. */
function standalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** An iPhone or iPad, including an iPad that says it's a Mac. */
function onIos() {
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  )
}

/** Safari on a Mac, which adds web apps to the Dock from its File menu. */
function onMacSafari() {
  const agent = navigator.userAgent
  return (
    /Macintosh/.test(agent) &&
    /Safari/.test(agent) &&
    !/Chrome|Chromium|Edg|Firefox|OPR/.test(agent)
  )
}

/** Listens for the browser's install prompt: called once, as the app starts. */
export function listenForInstall() {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Kept for the Install button, rather than shown by the browser.
    event.preventDefault()
    prompt = event as InstallPrompt
    changed()
  })
  window.addEventListener("appinstalled", () => {
    installedNow = true
    prompt = null
    guideOpen = false
    changed()
  })
  window
    .matchMedia("(display-mode: standalone)")
    .addEventListener("change", changed)
}

function wayNow(): InstallWay {
  if (installedNow || standalone()) return "installed"
  if (prompt) return "prompt"
  if (onIos()) return "ios"
  if (onMacSafari()) return "mac"
  return "menu"
}

/** Shows the steps to install, for browsers without a prompt. */
export function openInstallGuide(open = true) {
  guideOpen = open
  changed()
}

/**
 * How this device can install Merran, and a way to start: the browser's
 * own prompt where there is one, or the steps for it.
 */
export function useInstall() {
  React.useSyncExternalStore(subscribe, () => version)
  const way = wayNow()
  return {
    way,
    guideOpen,
    /** Installs, or shows how. Says whether it was installed from a prompt. */
    async install() {
      if (!prompt) {
        openInstallGuide()
        return null
      }
      const asked = prompt
      prompt = null
      await asked.prompt()
      const { outcome } = await asked.userChoice
      changed()
      return outcome
    },
  }
}

/** A phone or tablet: something with a touch screen and no mouse. */
export function onTouchDevice() {
  return window.matchMedia("(pointer: coarse)").matches
}

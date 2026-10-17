import * as React from "react"

/**
 * Keeps the screen on while mounted. The browser lets go when the tab is
 * hidden, so it's asked again on coming back. Says whether it's held.
 */
export function useWakeLock() {
  const [held, setHeld] = React.useState(false)

  React.useEffect(() => {
    if (!("wakeLock" in navigator)) return
    let lock: WakeLockSentinel | null = null
    let cancelled = false

    async function request() {
      try {
        const next = await navigator.wakeLock.request("screen")
        if (cancelled) {
          await next.release()
          return
        }
        lock = next
        setHeld(true)
        next.addEventListener("release", () => setHeld(false))
      } catch {
        // Not allowed here, or the battery is low.
        setHeld(false)
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") void request()
    }

    void request()
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      cancelled = true
      document.removeEventListener("visibilitychange", onVisibilityChange)
      void lock?.release()
    }
  }, [])

  return held
}

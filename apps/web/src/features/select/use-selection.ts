import * as React from "react"

/**
 * Select mode for a page of things (recipes now; list items, pantry items
 * and meals later): which ids are picked. Escape or leaving the page ends it.
 */
export function useSelection() {
  const [selecting, setSelecting] = React.useState(false)
  const [picked, setPicked] = React.useState<ReadonlySet<string>>(new Set())

  const done = React.useCallback(() => {
    setSelecting(false)
    setPicked(new Set())
  }, [])

  React.useEffect(() => {
    if (!selecting) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector("[role=dialog]")) {
        done()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selecting, done])

  /** Starts selecting, with this one picked when given (a long press). */
  const start = React.useCallback((id?: string) => {
    setSelecting(true)
    setPicked(id ? new Set([id]) : new Set())
  }, [])

  const toggle = React.useCallback(
    (id: string) =>
      setPicked((current) => {
        const next = new Set(current)
        if (!next.delete(id)) next.add(id)
        return next
      }),
    []
  )

  /** Picks all of these, or none when they're all picked already. */
  const toggleAll = React.useCallback(
    (ids: readonly string[]) =>
      setPicked((current) =>
        ids.length > 0 && ids.every((id) => current.has(id))
          ? new Set()
          : new Set(ids)
      ),
    []
  )

  /** Leaves out what's no longer there (deleted, or filtered away). */
  const keepOnly = React.useCallback(
    (ids: readonly string[]) =>
      setPicked((current) => {
        const there = new Set(ids)
        const next = new Set([...current].filter((id) => there.has(id)))
        return next.size === current.size ? current : next
      }),
    []
  )

  return {
    selecting,
    picked,
    count: picked.size,
    isPicked: (id: string) => picked.has(id),
    start,
    toggle,
    toggleAll,
    keepOnly,
    done,
  }
}

export type Selection = ReturnType<typeof useSelection>

/** Keeps the picks to what the page is showing. */
export function useSelectionKeepOnly(
  selection: Selection,
  ids: readonly string[]
) {
  const key = ids.join(",")
  const { keepOnly } = selection
  React.useEffect(() => {
    keepOnly(key ? key.split(",") : [])
  }, [key, keepOnly])
}

/**
 * A long press (half a second, without moving) on a touch screen, which
 * starts selecting with that thing. A mouse uses the Select button.
 */
export function useLongPress(onLongPress: () => void, enabled = true) {
  const timer = React.useRef<number | null>(null)
  const from = React.useRef<{ x: number; y: number } | null>(null)
  const fired = React.useRef(false)

  const cancel = () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    from.current = null
  }

  if (!enabled) return {}
  return {
    onPointerDown: (event: React.PointerEvent) => {
      if (event.pointerType === "mouse") return
      fired.current = false
      from.current = { x: event.clientX, y: event.clientY }
      timer.current = window.setTimeout(() => {
        fired.current = true
        navigator.vibrate?.(10)
        onLongPress()
      }, 500)
    },
    onPointerMove: (event: React.PointerEvent) => {
      if (!from.current) return
      const moved =
        Math.abs(event.clientX - from.current.x) +
        Math.abs(event.clientY - from.current.y)
      if (moved > 10) cancel()
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onContextMenu: (event: React.MouseEvent) => {
      if (from.current || fired.current) event.preventDefault()
    },
    /** Swallows the click that ends a long press, so it doesn't open the thing. */
    onClickCapture: (event: React.MouseEvent) => {
      if (fired.current) {
        event.preventDefault()
        event.stopPropagation()
        fired.current = false
      }
    },
  }
}

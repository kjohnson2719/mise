import * as React from "react"

import { DEFAULT_PALETTE, PALETTE_VALUES, type Palette } from "./palettes"
import { ThemeContext, type Mode } from "./theme-context"

// These keys are also read by the inline script in index.html, which applies
// the theme before React loads so the page never flashes the wrong colors.
const MODE_KEY = "merran-mode"
const PALETTE_KEY = "merran-palette"
const MODES: readonly Mode[] = ["light", "dark", "system"]
const DARK_QUERY = "(prefers-color-scheme: dark)"

function readStored<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T
): T {
  try {
    const value = localStorage.getItem(key)
    return allowed.includes(value as T) ? (value as T) : fallback
  } catch {
    return fallback
  }
}

function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage can be unavailable (private mode); the choice just won't persist.
  }
}

/** Applies a theme change without animating every colored element. */
function withoutTransitions(apply: () => void) {
  const style = document.createElement("style")
  style.textContent = "*,*::before,*::after{transition:none!important}"
  document.head.appendChild(style)
  apply()
  window.getComputedStyle(document.body)
  requestAnimationFrame(() => requestAnimationFrame(() => style.remove()))
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = React.useState<Mode>(() =>
    readStored(MODE_KEY, MODES, "system")
  )
  const [palette, setPaletteState] = React.useState<Palette>(() =>
    readStored(PALETTE_KEY, PALETTE_VALUES, DEFAULT_PALETTE)
  )
  const [systemDark, setSystemDark] = React.useState(
    () => window.matchMedia(DARK_QUERY).matches
  )

  React.useEffect(() => {
    const query = window.matchMedia(DARK_QUERY)
    const onChange = () => setSystemDark(query.matches)
    query.addEventListener("change", onChange)
    return () => query.removeEventListener("change", onChange)
  }, [])

  React.useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === MODE_KEY) {
        setModeState(readStored(MODE_KEY, MODES, "system"))
      } else if (event.key === PALETTE_KEY) {
        setPaletteState(
          readStored(PALETTE_KEY, PALETTE_VALUES, DEFAULT_PALETTE)
        )
      }
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  const resolvedMode =
    mode === "system" ? (systemDark ? "dark" : "light") : mode

  React.useLayoutEffect(() => {
    const root = document.documentElement
    withoutTransitions(() => {
      root.classList.toggle("dark", resolvedMode === "dark")
      root.dataset.palette = palette
      root.style.colorScheme = resolvedMode
    })
    // Match the browser chrome (iOS status bar, Android toolbar) to the page.
    const background = getComputedStyle(root).getPropertyValue("--background")
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", background.trim())
  }, [resolvedMode, palette])

  const setMode = React.useCallback((next: Mode) => {
    writeStored(MODE_KEY, next)
    setModeState(next)
  }, [])

  const setPalette = React.useCallback((next: Palette) => {
    writeStored(PALETTE_KEY, next)
    setPaletteState(next)
  }, [])

  const value = React.useMemo(
    () => ({ mode, resolvedMode, setMode, palette, setPalette }),
    [mode, resolvedMode, setMode, palette, setPalette]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

import * as React from "react"
import type { Palette } from "./palettes"

export type Mode = "light" | "dark" | "system"

export type ThemeContextValue = {
  mode: Mode
  resolvedMode: "light" | "dark"
  setMode: (mode: Mode) => void
  palette: Palette
  setPalette: (palette: Palette) => void
}

export const ThemeContext = React.createContext<ThemeContextValue | undefined>(
  undefined
)

export function useTheme() {
  const context = React.useContext(ThemeContext)
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }
  return context
}

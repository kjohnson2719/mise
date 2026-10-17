import { UNIT_SYSTEMS, type UnitSystem } from "@merran/shared"
import * as React from "react"

const KEY = "merran-units"

function read(): UnitSystem {
  try {
    const stored = localStorage.getItem(KEY)
    return (UNIT_SYSTEMS as readonly string[]).includes(stored ?? "")
      ? (stored as UnitSystem)
      : "written"
  } catch {
    return "written"
  }
}

/** How amounts are shown: as written, metric or US. Kept on this device. */
export function useUnitSystem() {
  const [system, setSystem] = React.useState<UnitSystem>(read)
  const change = React.useCallback((next: UnitSystem) => {
    setSystem(next)
    try {
      localStorage.setItem(KEY, next)
    } catch {
      // It still changes, just isn't remembered.
    }
  }, [])
  return [system, change] as const
}

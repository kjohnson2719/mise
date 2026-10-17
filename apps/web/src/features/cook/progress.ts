import * as React from "react"

/** Where cooking got to: the page, and the ingredients ticked off. */
export type Progress = {
  page: number
  ticked: string[]
  scale: number
  /** The recipe it was cooked with, if any. */
  with: string | null
  savedAt: number
}

// Kept on this device, so leaving the page (or the phone reloading it)
// doesn't lose your place. A meal's cooking is over within a few hours.
const KEEP_HOURS = 12
const key = (recipeId: string) => `merran-cooking.${recipeId}`

/** Where this recipe's cooking got to, if it was cooked the same way lately. */
export function loadProgress(
  recipeId: string,
  scale: number,
  withId: string | null
) {
  try {
    const saved = JSON.parse(
      localStorage.getItem(key(recipeId)) ?? "null"
    ) as Progress | null
    if (
      !saved ||
      saved.scale !== scale ||
      (saved.with ?? null) !== withId ||
      Date.now() - saved.savedAt > KEEP_HOURS * 3_600_000
    ) {
      return null
    }
    return saved
  } catch {
    return null
  }
}

export function saveProgress(recipeId: string, progress: Progress | null) {
  try {
    if (progress) localStorage.setItem(key(recipeId), JSON.stringify(progress))
    else localStorage.removeItem(key(recipeId))
  } catch {
    // Not remembered; cooking still works.
  }
}

export const TEXT_SIZES = ["standard", "large", "huge"] as const
export type TextSize = (typeof TEXT_SIZES)[number]

const TEXT_SIZE_KEY = "merran-cook-text"

function readTextSize(): TextSize {
  try {
    const stored = localStorage.getItem(TEXT_SIZE_KEY)
    return (TEXT_SIZES as readonly string[]).includes(stored ?? "")
      ? (stored as TextSize)
      : "standard"
  } catch {
    return "standard"
  }
}

/** How big the steps are, kept on this device: big enough to read from the stove. */
export function useTextSize() {
  const [size, setSize] = React.useState<TextSize>(readTextSize)
  const change = React.useCallback((next: TextSize) => {
    setSize(next)
    try {
      localStorage.setItem(TEXT_SIZE_KEY, next)
    } catch {
      // It still changes, just isn't remembered.
    }
  }, [])
  return [size, change] as const
}

import { splitDurations } from "@merran/shared"
import type { TFunction } from "i18next"

/**
 * A time the same way everywhere, however the recipe put it: "a minute" is
 * "1 minute", "1½ hours" is "1 hour 30 minutes", "5–7 min" is "5–7 minutes".
 */
export function formatDuration(
  t: TFunction,
  seconds: number,
  upTo: number | null = null
) {
  if (upTo !== null && upTo > seconds) {
    if (seconds % 3600 === 0 && upTo % 3600 === 0) {
      return t("cook.duration.hoursRange", {
        from: seconds / 3600,
        to: upTo / 3600,
      })
    }
    if (seconds % 60 === 0 && upTo % 60 === 0) {
      return t("cook.duration.minutesRange", {
        from: seconds / 60,
        to: upTo / 60,
      })
    }
    return t("cook.duration.secondsRange", { from: seconds, to: upTo })
  }
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  return [
    hours > 0 && t("cook.duration.hours", { count: hours }),
    minutes > 0 && t("cook.duration.minutes", { count: minutes }),
    rest > 0 && t("cook.duration.seconds", { count: rest }),
  ]
    .filter(Boolean)
    .join(" ")
}

/** A step with its times put the same way: "Stir for 1 minute." */
export function stepWords(t: TFunction, step: string) {
  return splitDurations(step)
    .map((piece) =>
      piece.type === "text"
        ? piece.text
        : formatDuration(t, piece.seconds, piece.upTo)
    )
    .join("")
}

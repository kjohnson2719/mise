import { useSyncExternalStore } from "react"
import { useTranslation } from "react-i18next"

import { Spinner } from "@/components/ui/spinner"

/**
 * The household being switched to, while the switch is under way. Kept
 * outside React and the router, since switching resets everything they hold.
 */
let switchingTo: string | null = null
const listeners = new Set<() => void>()

export function setSwitchingTo(name: string | null) {
  switchingTo = name
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Covers the app while a household switch reloads everything, so the
 * reload shows as one calm step instead of a blank flash. Rendered beside
 * the router, so it stays up while the app suspends beneath it.
 */
export function HouseholdSwitchOverlay() {
  const { t } = useTranslation()
  const name = useSyncExternalStore(subscribe, () => switchingTo)
  if (name === null) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-100 grid animate-in place-items-center bg-background/80 backdrop-blur-sm duration-200 fade-in-0"
    >
      <div className="grid animate-in justify-items-center gap-3 duration-300 fade-in-0 zoom-in-95">
        <Spinner className="size-8 text-primary" />
        <p className="text-sm text-muted-foreground">
          {t("account.switching", { name })}
        </p>
      </div>
    </div>
  )
}

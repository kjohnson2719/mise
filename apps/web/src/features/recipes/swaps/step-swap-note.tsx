import { convertTemperatures, type UnitSystem } from "@merran/shared"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"

import type { SwappedStep } from "./this-time"

/** Under a step a stand-in rewrote: saying so, and how it read before. */
export function StepSwapNote({
  swap,
  system,
}: {
  swap: SwappedStep | undefined
  system: UnitSystem
}) {
  const { t } = useTranslation()
  const [showing, setShowing] = React.useState(false)
  if (!swap?.original) return null
  return (
    <div className="grid gap-1 text-sm">
      <p className="flex flex-wrap items-center gap-x-2 text-primary">
        {t("recipes.swaps.changedStep")}
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0 text-sm"
          onClick={() => setShowing((now) => !now)}
        >
          {showing
            ? t("recipes.swaps.hideOriginal")
            : t("recipes.swaps.showOriginal")}
        </Button>
      </p>
      {showing && (
        <p className="text-muted-foreground line-through decoration-muted-foreground/40">
          {convertTemperatures(swap.original, system)}
        </p>
      )}
    </div>
  )
}

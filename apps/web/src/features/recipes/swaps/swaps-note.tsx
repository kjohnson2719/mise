import { ArrowDataTransferHorizontalIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"

import type { SwapThisTime } from "./this-time"

/** Above the ingredients: the stand-ins used this time, each with Undo. */
export function SwapsNote({
  swaps,
  onUndo,
}: {
  swaps: readonly SwapThisTime[]
  onUndo: (ingredientId: string) => void
}) {
  const { t } = useTranslation()
  if (swaps.length === 0) return null
  return (
    <ul className="grid gap-1.5" aria-label={t("recipes.swaps.label")}>
      {swaps.map((swap) => (
        <li
          key={swap.ingredientId}
          className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl bg-primary/10 px-3 py-2 text-sm"
        >
          <span className="flex min-w-0 items-start gap-2">
            <HugeiconsIcon
              icon={ArrowDataTransferHorizontalIcon}
              strokeWidth={2}
              className="mt-0.5 size-4 shrink-0 text-primary"
            />
            {t("recipes.swaps.thisTime", {
              lines: swap.lines.join(", "),
              line: swap.insteadOf,
            })}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="-my-1 -mr-2"
            onClick={() => onUndo(swap.ingredientId)}
          >
            {t("recipes.swaps.undo")}
          </Button>
        </li>
      ))}
    </ul>
  )
}

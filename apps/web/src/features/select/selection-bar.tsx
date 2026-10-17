import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import type { Selection } from "./use-selection"

export type SelectionAction = {
  label: string
  icon?: IconSvgElement
  onSelect: () => void
  destructive?: boolean
}

/** "4 selected · Select all · Done", in place of a page's own header buttons while selecting. */
export function SelectionHeader({
  selection,
  allIds,
}: {
  selection: Selection
  /** Everything showing, for Select all. */
  allIds: readonly string[]
}) {
  const { t } = useTranslation()
  const all = allIds.length > 0 && allIds.every((id) => selection.isPicked(id))
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="px-1 text-base font-semibold" aria-live="polite">
        {selection.count > 0
          ? t("select.selected", { count: selection.count })
          : t("select.pickSome")}
      </span>
      <Button
        variant="outline"
        disabled={allIds.length === 0}
        onClick={() => selection.toggleAll(allIds)}
      >
        {all
          ? t("select.selectNone")
          : t("select.selectAll", { count: allIds.length })}
      </Button>
      <Button variant="secondary" onClick={selection.done}>
        {t("select.done")}
      </Button>
    </div>
  )
}

/**
 * The actions for what's picked, in a bar at the foot of the screen (above
 * the tabs on a phone).
 */
export function SelectionBar({
  selection,
  actions,
}: {
  selection: Selection
  actions: SelectionAction[]
}) {
  const { t } = useTranslation()
  if (!selection.selecting) return null
  const none = selection.count === 0
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-3 md:bottom-6">
      <div
        role="toolbar"
        aria-label={t("select.actions", { count: selection.count })}
        className="pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-foreground p-1.5 text-background shadow-2xl"
      >
        {actions.map((action) => (
          <Button
            key={action.label}
            variant="ghost"
            disabled={none}
            onClick={action.onSelect}
            className={cn(
              "shrink-0 rounded-full text-background hover:bg-background/15 hover:text-background",
              action.destructive &&
                "text-red-300 hover:text-red-200 dark:text-red-700 dark:hover:text-red-800"
            )}
          >
            {action.icon && (
              <HugeiconsIcon
                icon={action.icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
            )}
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  )
}

/** For a page's own header: a Select button that starts select mode. */
export function SelectButton({
  selection,
  disabled,
}: {
  selection: Selection
  disabled?: boolean
}) {
  const { t } = useTranslation()
  return (
    <Button
      variant="outline"
      disabled={disabled}
      onClick={() => selection.start()}
    >
      {t("select.start")}
    </Button>
  )
}

import { Tick02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { cn } from "@/lib/utils"

/** The tick box shown on each thing while selecting. */
export function SelectMark({
  picked,
  className,
}: {
  picked: boolean
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-6 items-center justify-center rounded-lg border-2 transition-colors",
        picked
          ? "border-primary bg-primary text-primary-foreground"
          : "border-muted-foreground/50 bg-card/90",
        className
      )}
    >
      {picked && (
        <HugeiconsIcon icon={Tick02Icon} strokeWidth={3} className="size-4" />
      )}
    </span>
  )
}

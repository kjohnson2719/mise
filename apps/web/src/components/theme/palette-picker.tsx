import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"

import { PALETTES } from "./palettes"
import { useTheme } from "./theme-context"

export function PalettePicker({ className }: { className?: string }) {
  const { t } = useTranslation()
  const { palette, setPalette } = useTheme()

  return (
    <div
      role="radiogroup"
      aria-label={t("theme.palette")}
      className={cn("grid gap-3 sm:grid-cols-3", className)}
    >
      {PALETTES.map((option) => {
        const selected = option.value === palette
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setPalette(option.value)}
            className={cn(
              "flex flex-col gap-3 rounded-2xl border bg-card p-4 text-left transition-colors outline-none hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50",
              selected && "border-primary ring-1 ring-primary"
            )}
          >
            <span
              className="flex h-12 items-center gap-2 rounded-xl px-3"
              style={{ backgroundColor: option.swatches.background }}
            >
              <span
                className="size-6 rounded-full"
                style={{ backgroundColor: option.swatches.primary }}
              />
              <span
                className="size-6 rounded-full"
                style={{ backgroundColor: option.swatches.highlight }}
              />
            </span>
            <span>
              <span className="block font-medium">
                {t(option.nameKey as "theme.palettes.sage.name")}
              </span>
              <span className="block text-sm text-muted-foreground">
                {t(option.descriptionKey as "theme.palettes.sage.description")}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

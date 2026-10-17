import { Tag01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"

import type { RecipeSale } from "./queries"

/** What a recipe uses that's on sale: "On sale: chicken thighs". */
export function OnSaleBadge({ sales }: { sales: readonly RecipeSale[] }) {
  const { t, i18n } = useTranslation()
  const list = new Intl.ListFormat(i18n.language, { type: "conjunction" })
  const foods = list.format(sales.slice(0, 2).map((sale) => sale.name))
  const lowest = sales.some((sale) => sale.verdict === "lowest")
  const label = lowest
    ? t("stores.deals.lowestOn", { foods })
    : t("stores.deals.onSale", { foods })
  // Cut short at its row's width, with the whole of it on hover.
  return (
    <Badge
      variant="outline"
      title={label}
      className="max-w-full border-primary/40 text-primary"
    >
      <HugeiconsIcon
        icon={Tag01Icon}
        strokeWidth={2}
        data-icon="inline-start"
        className="shrink-0"
      />
      <span className="truncate">{label}</span>
    </Badge>
  )
}
